/// <reference types="vite/client" />

import type { ScenarioResult } from './harness';

declare global {
    interface Window {
        __loadTest: {
            scenarios: string[];
            run: (name: string, overrides?: Record<string, number>) => Promise<ScenarioResult>;
        };
        __sharedTab: {
            connect: (tabId: number) => void;
            send: (count: number) => void;
            stats: () => { received: number };
        };
    }
}

export {};
