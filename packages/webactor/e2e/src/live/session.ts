import { sleep } from '../harness';
import {
    createSimulationApp,
    SIMULATION_ACTIONS,
    type SimulationActionName,
    type SimulationApp,
    type SimulationCounters,
} from './app';

export type SimulationStats = SimulationCounters & {
    /** The autonomous loop is picking actions on its own. */
    running: boolean;
    /** The app is up, whether or not the loop drives it. */
    live: boolean;
    uptimeMs: number;
    activity: string;
};

const NO_COUNTERS: SimulationCounters = {
    chatsOpened: 0,
    keystrokes: 0,
    messagesSent: 0,
    messagesReceived: 0,
    searches: 0,
    historyPages: 0,
    uploads: 0,
    uploadCrashes: 0,
    analyticsEvents: 0,
};

let app: SimulationApp | undefined;
let looping = false;
let startedAt = 0;
let queue: Promise<void> = Promise.resolve();
let last: SimulationStats | undefined;

function ensureApp(): SimulationApp {
    if (app === undefined || !app.alive) {
        app = createSimulationApp();
        startedAt = performance.now();
        last = undefined;
    }
    return app;
}

/** One queue for both drivers, so a click never lands in the middle of a loop action. */
function enqueue<T>(job: () => Promise<T>): Promise<T> {
    const result = queue.then(job);
    queue = result.then(
        () => {},
        () => {},
    );
    return result;
}

function pickWeighted(target: SimulationApp): SimulationActionName {
    const weighted = SIMULATION_ACTIONS.filter((action) => action.weight > 0);
    const total = weighted.reduce((sum, action) => sum + action.weight, 0);

    let roll = target.between(0, total);
    for (const action of weighted) {
        roll -= action.weight;
        if (roll <= 0) return action.name;
    }
    return 'idle';
}

export function runSimulationAction(name: SimulationActionName): Promise<SimulationStats> {
    const target = ensureApp();
    return enqueue(async () => {
        if (target.alive) await target.actions[name]();
        return simulationStats();
    });
}

export function startSimulation(): SimulationStats {
    if (looping) return simulationStats();

    const target = ensureApp();
    looping = true;

    void (async () => {
        try {
            // A person arrives, opens a chat and writes something before they start wandering.
            for (const opening of ['sign-in', 'open-chat', 'type-and-send'] as SimulationActionName[]) {
                if (!looping || !target.alive) return;
                await enqueue(target.actions[opening]);
            }

            while (looping && target.alive) {
                await enqueue(target.actions[pickWeighted(target)]);
                if (!looping || !target.alive) break;
                target.setActivity('thinking');
                await sleep(target.between(700, 2600));
            }
        } catch {
            /* the user simply left the page */
        }
    })();

    return simulationStats();
}

/** Stops picking actions but leaves the graph standing, so it can be driven by hand from here. */
export function pauseSimulation(): SimulationStats {
    looping = false;
    app?.setActivity('waiting');
    return simulationStats();
}

export function stopSimulation(): SimulationStats {
    const stats = simulationStats();
    looping = false;

    try {
        app?.dispose();
    } catch {
        /* teardown is best effort */
    }
    app = undefined;

    last = { ...stats, running: false, live: false, activity: 'gone' };
    return last;
}

export function simulationStats(): SimulationStats {
    if (app === undefined || !app.alive) {
        return last ?? { ...NO_COUNTERS, running: false, live: false, uptimeMs: 0, activity: 'idle' };
    }

    return {
        ...app.counters,
        running: looping,
        live: true,
        uptimeMs: Math.round(performance.now() - startedAt),
        activity: app.activity,
    };
}
