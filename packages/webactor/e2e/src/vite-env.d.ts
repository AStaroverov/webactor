/// <reference types="vite/client" />

import type { ScenarioResult } from './harness';
import type { SimulationActionName } from './live/app';
import type { SimulationStats } from './live/session';

declare global {
    interface Window {
        __loadTest: {
            scenarios: string[];
            run: (name: string, overrides?: Record<string, number>) => Promise<ScenarioResult>;
        };
        /** Only present on /live.html. */
        __simulation: {
            actions: SimulationActionName[];
            start: () => SimulationStats;
            pause: () => SimulationStats;
            stop: () => SimulationStats;
            run: (name: SimulationActionName) => Promise<SimulationStats>;
            stats: () => SimulationStats;
        };
        __sharedTab: {
            connect: (tabId: number) => void;
            send: (count: number) => void;
            stats: () => { received: number };
        };
    }
}

export {};
