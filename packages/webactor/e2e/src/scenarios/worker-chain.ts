import type { AnyEnvelope, Transmitter } from 'webactor';
import { connectActorToWorker, connectTransmitters, createActor, createEnvelope } from 'webactor';
import type { ScenarioResult } from '../harness';
import { round, Sampler, sleep, waitUntil } from '../harness';

export type WorkerChainConfig = {
    chainLength: number;
    messages: number;
};

export const workerChainDefaults: WorkerChainConfig = {
    chainLength: 8,
    messages: 200,
};

export async function runWorkerChain(overrides: Partial<WorkerChainConfig> = {}): Promise<ScenarioResult> {
    const { chainLength, messages } = { ...workerChainDefaults, ...overrides };
    const startedAt = performance.now();
    const errors: string[] = [];
    const endToEnd = new Sampler();

    const workers: Worker[] = [];
    for (let i = 0; i < chainLength; i++) {
        const worker = new Worker(new URL('../workers/relay.worker.ts', import.meta.url), {
            type: 'module',
            name: `relay-${i}`,
        });
        worker.addEventListener('error', (event) => {
            errors.push(`relay ${i}: ${event.message}`);
        });
        worker.postMessage(createEnvelope('message', { type: 'init', index: i }));
        workers.push(worker);
    }

    const bridges: VoidFunction[] = [];
    for (let i = 0; i < chainLength - 1; i++) {
        bridges.push(
            connectTransmitters(workers[i] as unknown as Transmitter, workers[i + 1] as unknown as Transmitter),
        );
    }

    let completed = 0;
    let checkpointChars = 0;
    let send: (payload: unknown) => void = () => {};
    const client = createActor('chain-client', (context) => {
        send = (payload) => context.postMessage(payload as never);
        const listener = (envelope: AnyEnvelope) => {
            const data = envelope.data as { type?: string; hop?: number; sentAt?: number };
            if (data?.type === 'chain' && data.hop === chainLength) {
                completed += 1;
                endToEnd.add(performance.now() - data.sentAt!);
                checkpointChars = Math.max(checkpointChars, (envelope.__checkpoints ?? '').length);
            }
        };
        context.addEventListener('message', listener);
        return () => context.removeEventListener('message', listener);
    });

    const disconnects = [connectActorToWorker(client, workers[0])];
    if (chainLength > 1) {
        disconnects.push(connectActorToWorker(client, workers[chainLength - 1]));
    }
    client.launch();

    const travelStart = performance.now();
    for (let seq = 0; seq < messages; seq++) {
        send({ type: 'chain', hop: 0, seq, sentAt: performance.now() });
        if (seq % 50 === 49) await sleep(0);
    }

    try {
        await waitUntil(() => completed >= messages, {
            timeoutMs: 60_000,
            label: () => `worker chain: ${completed}/${messages} messages completed ${chainLength} hops`,
        });
    } catch (error) {
        errors.push(String(error));
    }
    const travelMs = performance.now() - travelStart;

    for (const disconnect of disconnects) disconnect();
    for (const bridge of bridges) bridge();
    client.close();
    for (const worker of workers) worker.terminate();

    return {
        scenario: 'worker-chain',
        config: { chainLength, messages },
        durationMs: round(performance.now() - startedAt),
        counters: {
            workersSpawned: chainLength,
            messagesSent: messages,
            messagesCompleted: completed,
            hopsTraveled: completed * chainLength,
            hopsPerSecond: Math.round((completed * chainLength) / (travelMs / 1000)),
            maxCheckpointChars: checkpointChars,
        },
        timings: {
            endToEnd: endToEnd.summary(),
        },
        errors,
    };
}
