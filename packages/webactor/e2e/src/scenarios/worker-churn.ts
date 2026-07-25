import { connectActorToWorker, createActor } from 'webactor';
import type { ScenarioResult } from '../harness';
import { onActorMessage, round, Sampler, waitUntil } from '../harness';

export type WorkerChurnConfig = {
    rounds: number;
    workersPerRound: number;
    messagesPerWorker: number;
};

export const workerChurnDefaults: WorkerChurnConfig = {
    rounds: 3,
    workersPerRound: 8,
    messagesPerWorker: 100,
};

async function churnSingleWorker(
    id: string,
    messagesPerWorker: number,
    spawnToFirstEcho: Sampler,
    roundTrip: Sampler,
    errors: string[],
): Promise<number> {
    const spawnStart = performance.now();
    const worker = new Worker(new URL('../workers/echo.worker.ts', import.meta.url), {
        type: 'module',
        name: `load-worker-${id}`,
    });
    worker.addEventListener('error', (event) => {
        errors.push(`worker ${id}: ${event.message}`);
    });

    let received = 0;
    let firstEchoAt = 0;
    const client = createActor(`client-${id}`, (context) => {
        const off = onActorMessage(context, (data) => {
            if (firstEchoAt === 0) firstEchoAt = performance.now();
            received += 1;
            roundTrip.add(performance.now() - (data as { sentAt: number }).sentAt);
        });
        for (let seq = 0; seq < messagesPerWorker; seq++) {
            context.postMessage({ seq, sentAt: performance.now() });
        }
        return off;
    });

    const disconnect = connectActorToWorker(client, worker);
    client.launch();

    try {
        await waitUntil(() => received >= messagesPerWorker, {
            timeoutMs: 30_000,
            label: () => `worker ${id}: got ${received}/${messagesPerWorker} echoes`,
        });
        spawnToFirstEcho.add(firstEchoAt - spawnStart);
    } catch (error) {
        errors.push(String(error));
    } finally {
        disconnect();
        client.close();
        worker.terminate();
    }

    return received;
}

export async function runWorkerChurn(overrides: Partial<WorkerChurnConfig> = {}): Promise<ScenarioResult> {
    const { rounds, workersPerRound, messagesPerWorker } = { ...workerChurnDefaults, ...overrides };
    const startedAt = performance.now();
    const errors: string[] = [];
    const spawnToFirstEcho = new Sampler();
    const roundTrip = new Sampler();

    let workersSpawned = 0;
    let echoesReceived = 0;

    for (let round_ = 0; round_ < rounds; round_++) {
        const results = await Promise.all(
            Array.from({ length: workersPerRound }, (_, i) =>
                churnSingleWorker(`${round_}-${i}`, messagesPerWorker, spawnToFirstEcho, roundTrip, errors),
            ),
        );
        workersSpawned += workersPerRound;
        echoesReceived += results.reduce((sum, value) => sum + value, 0);
    }

    return {
        scenario: 'worker-churn',
        config: { rounds, workersPerRound, messagesPerWorker },
        durationMs: round(performance.now() - startedAt),
        counters: {
            workersSpawned,
            workersTerminated: workersSpawned,
            echoesExpected: rounds * workersPerRound * messagesPerWorker,
            echoesReceived,
        },
        timings: {
            spawnToFirstEcho: spawnToFirstEcho.summary(),
            roundTrip: roundTrip.summary(),
        },
        errors,
    };
}
