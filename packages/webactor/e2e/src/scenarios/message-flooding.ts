import type { Actor } from 'webactor';
import { connectActors, createActor } from 'webactor';
import type { ScenarioResult } from '../harness';
import { onActorMessage, round, Sampler, sleep, waitUntil } from '../harness';

export type FloodingConfig = {
    producers: number;
    consumers: number;
    bursts: number;
    messagesPerBurst: number;
};

export const floodingDefaults: FloodingConfig = {
    producers: 10,
    consumers: 20,
    bursts: 10,
    messagesPerBurst: 100,
};

const LATENCY_SAMPLE_EVERY = 25;

export async function runMessageFlooding(overrides: Partial<FloodingConfig> = {}): Promise<ScenarioResult> {
    const { producers, consumers, bursts, messagesPerBurst } = { ...floodingDefaults, ...overrides };
    const startedAt = performance.now();
    const errors: string[] = [];
    const latency = new Sampler();

    let received = 0;
    const senders: Array<(payload: { seq: number; sentAt: number }) => void> = [];
    const actors: Actor[] = [];
    const disconnects: VoidFunction[] = [];

    for (let i = 0; i < consumers; i++) {
        const consumer = createActor(`consumer-${i}`, (context) => {
            return onActorMessage(context, (data) => {
                received += 1;
                const message = data as { seq: number; sentAt: number };
                if (message.seq % LATENCY_SAMPLE_EVERY === 0) {
                    latency.add(performance.now() - message.sentAt);
                }
            });
        });
        actors.push(consumer);
    }

    for (let i = 0; i < producers; i++) {
        const producer = createActor(`producer-${i}`, (context) => {
            senders[i] = (payload) => context.postMessage(payload);
        });
        for (let j = 0; j < consumers; j++) {
            disconnects.push(connectActors(producer, actors[j]));
        }
        actors.push(producer);
    }

    for (const actor of actors) actor.launch();

    const messagesSent = producers * bursts * messagesPerBurst;
    const expected = messagesSent * consumers;

    const floodStart = performance.now();
    for (let burst = 0; burst < bursts; burst++) {
        for (let p = 0; p < producers; p++) {
            for (let m = 0; m < messagesPerBurst; m++) {
                senders[p]({ seq: burst * messagesPerBurst + m, sentAt: performance.now() });
            }
        }
        await sleep(0);
    }

    await waitUntil(() => received >= expected, {
        timeoutMs: 120_000,
        label: () => `flooding: got ${received}/${expected} deliveries`,
    });
    const floodMs = performance.now() - floodStart;

    await sleep(30);
    if (received !== expected) {
        errors.push(`expected ${expected} deliveries, got ${received}`);
    }

    for (const disconnect of disconnects) disconnect();
    for (const actor of actors) actor.close();

    return {
        scenario: 'message-flooding',
        config: { producers, consumers, bursts, messagesPerBurst },
        durationMs: round(performance.now() - startedAt),
        counters: {
            messagesSent,
            deliveriesExpected: expected,
            deliveriesReceived: received,
            deliveriesPerSecond: Math.round(expected / (floodMs / 1000)),
        },
        timings: {
            deliveryLatency: latency.summary(),
        },
        errors,
    };
}
