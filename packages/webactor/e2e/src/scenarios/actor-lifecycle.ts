import type { Actor } from 'webactor';
import { connectActors, createActor } from 'webactor';
import type { ScenarioResult } from '../harness';
import { onActorMessage, round, Sampler, waitUntil } from '../harness';

export type LifecycleConfig = { waves: number; actorsPerWave: number; messagesPerPair: number };

export const lifecycleDefaults: LifecycleConfig = { waves: 10, actorsPerWave: 1000, messagesPerPair: 10 };

export type WaveStats = {
    actorsCreated: number;
    repliesReceived: number;
    creationMs: number;
    exchangeMs: number;
    closeMs: number;
};

export async function runWave(waveId: string, actorsPerWave: number, messagesPerPair: number): Promise<WaveStats> {
    const pairs = Math.floor(actorsPerWave / 2);
    const expectedReplies = pairs * messagesPerPair;
    let replies = 0;

    const actors: Actor[] = [];
    const disconnects: VoidFunction[] = [];

    const creationStart = performance.now();
    for (let i = 0; i < pairs; i++) {
        const echo = createActor(`echo-${waveId}-${i}`, (context) => {
            return onActorMessage(context, (data) => context.postMessage(data));
        });
        const ping = createActor(`ping-${waveId}-${i}`, (context) => {
            const off = onActorMessage(context, () => {
                replies += 1;
            });
            for (let seq = 0; seq < messagesPerPair; seq++) {
                context.postMessage({ pair: i, seq });
            }
            return off;
        });
        disconnects.push(connectActors(ping, echo));
        echo.launch();
        ping.launch();
        actors.push(echo, ping);
    }
    const creationMs = performance.now() - creationStart;

    const exchangeStart = performance.now();
    await waitUntil(() => replies >= expectedReplies, {
        label: () => `wave ${waveId}: got ${replies}/${expectedReplies} replies`,
    });
    const exchangeMs = performance.now() - exchangeStart;

    const closeStart = performance.now();
    for (const disconnect of disconnects) disconnect();
    for (const actor of actors) actor.close();
    const closeMs = performance.now() - closeStart;

    return { actorsCreated: pairs * 2, repliesReceived: replies, creationMs, exchangeMs, closeMs };
}

export async function runActorLifecycle(overrides: Partial<LifecycleConfig> = {}): Promise<ScenarioResult> {
    const { waves, actorsPerWave, messagesPerPair } = { ...lifecycleDefaults, ...overrides };
    const startedAt = performance.now();
    const creation = new Sampler();
    const exchange = new Sampler();
    const closing = new Sampler();
    let actorsCreated = 0;
    let repliesReceived = 0;

    for (let wave = 0; wave < waves; wave++) {
        const stats = await runWave(`${wave}`, actorsPerWave, messagesPerPair);
        actorsCreated += stats.actorsCreated;
        repliesReceived += stats.repliesReceived;
        creation.add(stats.creationMs);
        exchange.add(stats.exchangeMs);
        closing.add(stats.closeMs);
    }

    return {
        scenario: 'actor-lifecycle',
        config: { waves, actorsPerWave, messagesPerPair },
        durationMs: round(performance.now() - startedAt),
        counters: {
            actorsCreated,
            actorsClosed: actorsCreated,
            expectedReplies: waves * Math.floor(actorsPerWave / 2) * messagesPerPair,
            repliesReceived,
            creationPerSecond: Math.round(actorsCreated / (creation.total() / 1000)),
        },
        timings: {
            waveCreation: creation.summary(),
            waveExchange: exchange.summary(),
            waveClose: closing.summary(),
        },
        errors: [],
    };
}
