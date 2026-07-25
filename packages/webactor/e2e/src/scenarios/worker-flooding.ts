import { connectActorToWorker, createActor } from 'webactor';
import type { ScenarioResult } from '../harness';
import { onActorMessage, round, Sampler, sleep, waitUntil } from '../harness';

export type WorkerFloodingConfig = {
    workers: number;
    messagesPerWorker: number;
    payloadBytes: number;
};

export const workerFloodingDefaults: WorkerFloodingConfig = {
    workers: 8,
    messagesPerWorker: 5000,
    payloadBytes: 128,
};

const SEND_BATCH = 500;

async function floodSingleWorker(
    id: number,
    messagesPerWorker: number,
    payload: string,
    queueDrain: Sampler,
    errors: string[],
): Promise<number> {
    const worker = new Worker(new URL('../workers/flood-consumer.worker.ts', import.meta.url), {
        type: 'module',
        name: `flood-worker-${id}`,
    });
    worker.addEventListener('error', (event) => {
        errors.push(`worker ${id}: ${event.message}`);
    });

    let reported = -1;
    let send: (payload: unknown) => void = () => {};
    const client = createActor(`flood-client-${id}`, (context) => {
        send = (message) => context.postMessage(message as never);
        return onActorMessage(context, (data) => {
            const message = data as { type: string; received: number };
            if (message.type === 'stats') reported = message.received;
        });
    });

    const disconnect = connectActorToWorker(client, worker);
    client.launch();

    try {
        for (let seq = 0; seq < messagesPerWorker; seq++) {
            send({ type: 'flood', seq, payload });
            if (seq % SEND_BATCH === SEND_BATCH - 1) await sleep(0);
        }
        const drainStart = performance.now();
        send({ type: 'report' });
        await waitUntil(() => reported !== -1, {
            timeoutMs: 60_000,
            label: () => `worker ${id}: no stats reply, last reported ${reported}`,
        });
        queueDrain.add(performance.now() - drainStart);
        if (reported !== messagesPerWorker) {
            errors.push(`worker ${id}: sent ${messagesPerWorker}, worker received ${reported}`);
        }
    } catch (error) {
        errors.push(String(error));
    } finally {
        disconnect();
        client.close();
        worker.terminate();
    }

    return Math.max(reported, 0);
}

export async function runWorkerFlooding(overrides: Partial<WorkerFloodingConfig> = {}): Promise<ScenarioResult> {
    const { workers, messagesPerWorker, payloadBytes } = { ...workerFloodingDefaults, ...overrides };
    const startedAt = performance.now();
    const errors: string[] = [];
    const queueDrain = new Sampler();
    const payload = 'x'.repeat(payloadBytes);

    const floodStart = performance.now();
    const results = await Promise.all(
        Array.from({ length: workers }, (_, i) =>
            floodSingleWorker(i, messagesPerWorker, payload, queueDrain, errors),
        ),
    );
    const floodMs = performance.now() - floodStart;

    const delivered = results.reduce((sum, value) => sum + value, 0);
    const expected = workers * messagesPerWorker;

    return {
        scenario: 'worker-flooding',
        config: { workers, messagesPerWorker, payloadBytes },
        durationMs: round(performance.now() - startedAt),
        counters: {
            workersSpawned: workers,
            messagesExpected: expected,
            messagesDelivered: delivered,
            messagesPerSecond: Math.round(expected / (floodMs / 1000)),
            bytesSent: expected * payloadBytes,
        },
        timings: {
            queueDrain: queueDrain.summary(),
        },
        errors,
    };
}
