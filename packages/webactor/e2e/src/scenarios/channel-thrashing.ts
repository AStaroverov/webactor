import type { Actor } from 'webactor';
import { connectActors, createActor } from 'webactor';
import type { ScenarioResult } from '../harness';
import { createPRNG, onActorMessage, round, Sampler, sleep, waitUntil } from '../harness';

export type ThrashingConfig = {
    actors: number;
    rounds: number;
    createPerRound: number;
    destroyPerRound: number;
    seed: number;
};

export const thrashingDefaults: ThrashingConfig = {
    actors: 200,
    rounds: 5,
    createPerRound: 600,
    destroyPerRound: 400,
    seed: 1337,
};

export async function runChannelThrashing(overrides: Partial<ThrashingConfig> = {}): Promise<ScenarioResult> {
    const {
        actors: actorCount,
        rounds,
        createPerRound,
        destroyPerRound,
        seed,
    } = { ...thrashingDefaults, ...overrides };
    const startedAt = performance.now();
    const random = createPRNG(seed);
    const errors: string[] = [];

    let received = 0;
    const emitters: Array<(payload: string) => void> = [];
    const actors: Actor[] = [];

    for (let i = 0; i < actorCount; i++) {
        const actor = createActor(`node-${i}`, (context) => {
            emitters[i] = (payload) => context.postMessage(payload);
            return onActorMessage(context, () => {
                received += 1;
            });
        });
        actor.launch();
        actors.push(actor);
    }

    const live: VoidFunction[] = [];
    let connectionsCreated = 0;
    let connectionsDestroyed = 0;
    let verificationFailures = 0;
    const connectTiming = new Sampler();
    const verifyTiming = new Sampler();

    const pickPair = () => {
        const a = Math.floor(random() * actorCount);
        let b = Math.floor(random() * (actorCount - 1));
        if (b >= a) b += 1;
        return [a, b] as const;
    };

    const verify = async (stage: string) => {
        const verifyStart = performance.now();
        received = 0;
        for (const emit of emitters) emit('verify');
        const expected = live.length * 2;
        try {
            await waitUntil(() => received >= expected, {
                timeoutMs: 20_000,
                label: () => `${stage}: got ${received}/${expected} deliveries`,
            });
            await sleep(30);
            if (received !== expected) {
                verificationFailures += 1;
                errors.push(`${stage}: expected ${expected} deliveries, got ${received}`);
            }
        } catch (error) {
            verificationFailures += 1;
            errors.push(String(error));
        }
        verifyTiming.add(performance.now() - verifyStart);
    };

    for (let round_ = 0; round_ < rounds; round_++) {
        const connectStart = performance.now();
        for (let i = 0; i < createPerRound; i++) {
            const [a, b] = pickPair();
            live.push(connectActors(actors[a], actors[b]));
            connectionsCreated += 1;
        }
        connectTiming.add(performance.now() - connectStart);

        for (let i = 0; i < destroyPerRound && live.length > 0; i++) {
            const index = Math.floor(random() * live.length);
            live.splice(index, 1)[0]();
            connectionsDestroyed += 1;
        }

        await verify(`round ${round_}`);
    }

    while (live.length > 0) {
        live.pop()!();
        connectionsDestroyed += 1;
    }
    await verify('after full disconnect');

    for (const actor of actors) actor.close();

    return {
        scenario: 'channel-thrashing',
        config: { actors: actorCount, rounds, createPerRound, destroyPerRound, seed },
        durationMs: round(performance.now() - startedAt),
        counters: {
            connectionsCreated,
            connectionsDestroyed,
            verificationFailures,
        },
        timings: {
            roundConnect: connectTiming.summary(),
            roundVerify: verifyTiming.summary(),
        },
        errors,
    };
}
