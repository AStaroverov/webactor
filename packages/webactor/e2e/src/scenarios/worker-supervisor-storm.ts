import { applyWorkerSupervisor } from 'webactor';
import type { ScenarioResult } from '../harness';
import { round, sleep, waitUntil } from '../harness';

export type WorkerSupervisorStormConfig = {
    supervisors: number;
    restartsPerSupervisor: number;
};

export const workerSupervisorStormDefaults: WorkerSupervisorStormConfig = {
    supervisors: 3,
    restartsPerSupervisor: 8,
};

export async function runWorkerSupervisorStorm(
    overrides: Partial<WorkerSupervisorStormConfig> = {},
): Promise<ScenarioResult> {
    const { supervisors: supervisorCount, restartsPerSupervisor } = {
        ...workerSupervisorStormDefaults,
        ...overrides,
    };
    const startedAt = performance.now();
    const errors: string[] = [];

    let spawns = 0;

    const supervisors = Array.from({ length: supervisorCount }, (_, id) => {
        let crashes = 0;
        const supervisor = applyWorkerSupervisor(
            () => {
                spawns += 1;
                return new Worker(new URL('../workers/crash.worker.ts', import.meta.url), {
                    type: 'module',
                    name: `crash-${id}-${spawns}`,
                });
            },
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

    const expectedSpawns = supervisorCount * (restartsPerSupervisor + 1);
    try {
        await waitUntil(() => spawns >= expectedSpawns, {
            timeoutMs: 120_000,
            label: () => `worker supervisor storm: ${spawns}/${expectedSpawns} spawns`,
        });
    } catch (error) {
        errors.push(String(error));
    }
    const stormMs = performance.now() - startedAt;

    await sleep(300);
    for (const supervisor of supervisors) supervisor.close();

    const spawnsAfterClose = spawns;
    await sleep(300);
    if (spawns !== spawnsAfterClose) {
        errors.push(`zombie respawn: ${spawns - spawnsAfterClose} worker spawns after close`);
    }

    return {
        scenario: 'worker-supervisor-storm',
        config: { supervisors: supervisorCount, restartsPerSupervisor },
        durationMs: round(performance.now() - startedAt),
        counters: {
            spawnsExpected: expectedSpawns,
            spawnsHappened: spawns,
            restartsPerformed: spawns - supervisorCount,
            restartsPerSecond: Math.round((spawns - supervisorCount) / (stormMs / 1000)),
        },
        timings: {},
        errors,
    };
}
