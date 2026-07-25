import { applyActorSupervisor, createActor } from 'webactor';
import type { ScenarioResult } from '../harness';
import { round, sleep, waitUntil } from '../harness';

export type ActorSupervisorStormConfig = {
    supervisors: number;
    restartsPerSupervisor: number;
};

export const actorSupervisorStormDefaults: ActorSupervisorStormConfig = {
    supervisors: 20,
    restartsPerSupervisor: 50,
};

export async function runActorSupervisorStorm(
    overrides: Partial<ActorSupervisorStormConfig> = {},
): Promise<ScenarioResult> {
    const { supervisors: supervisorCount, restartsPerSupervisor } = { ...actorSupervisorStormDefaults, ...overrides };
    const startedAt = performance.now();
    const errors: string[] = [];

    let constructions = 0;
    let alive = 0;

    const supervisors = Array.from({ length: supervisorCount }, (_, id) => {
        let crashes = 0;
        const supervisor = applyActorSupervisor(
            () =>
                createActor(`crasher-${id}`, (context) => {
                    constructions += 1;
                    alive += 1;
                    queueMicrotask(() => context.close(new Error(`crash-${id}`)));
                    return () => {
                        alive -= 1;
                    };
                }),
            {
                shouldRetry: () => {
                    crashes += 1;
                    return crashes <= restartsPerSupervisor;
                },
            },
        );
        supervisor.launch();
        return supervisor;
    });

    const expectedConstructions = supervisorCount * (restartsPerSupervisor + 1);
    try {
        await waitUntil(() => constructions >= expectedConstructions && alive === 0, {
            timeoutMs: 60_000,
            label: () => `supervisor storm: ${constructions}/${expectedConstructions} constructions, ${alive} alive`,
        });
    } catch (error) {
        errors.push(String(error));
    }
    const stormMs = performance.now() - startedAt;

    for (const supervisor of supervisors) supervisor.close();

    const constructionsAfterClose = constructions;
    await sleep(100);
    if (constructions !== constructionsAfterClose) {
        errors.push(`zombie relaunch: ${constructions - constructionsAfterClose} constructions after close`);
    }

    return {
        scenario: 'actor-supervisor-storm',
        config: { supervisors: supervisorCount, restartsPerSupervisor },
        durationMs: round(performance.now() - startedAt),
        counters: {
            constructionsExpected: expectedConstructions,
            constructionsHappened: constructions,
            restartsPerformed: constructions - supervisorCount,
            restartsPerSecond: Math.round((constructions - supervisorCount) / (stormMs / 1000)),
            aliveAfterStorm: alive,
        },
        timings: {},
        errors,
    };
}
