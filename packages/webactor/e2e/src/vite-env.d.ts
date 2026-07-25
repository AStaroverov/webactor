/// <reference types="vite/client" />

import type { ScenarioResult } from './harness';
import type { SimulationStats } from './scenarios/simulation';

declare global {
    interface Window {
        __loadTest: {
            scenarios: string[];
            run: (name: string, overrides?: Record<string, number>) => Promise<ScenarioResult>;
        };
        __simulation: {
            start: () => SimulationStats;
            stop: () => SimulationStats;
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
