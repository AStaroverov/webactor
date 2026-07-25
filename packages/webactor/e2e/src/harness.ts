import type { ActorContext, AnyData } from 'webactor';

export type TimingSummary = { count: number; avgMs: number; p95Ms: number; maxMs: number };

export type ScenarioResult = {
    scenario: string;
    config: Record<string, number>;
    durationMs: number;
    counters: Record<string, number>;
    timings: Record<string, TimingSummary>;
    errors: string[];
};

export const round = (value: number) => Math.round(value * 1000) / 1000;

export class Sampler {
    private samples: number[] = [];

    add(ms: number): void {
        this.samples.push(ms);
    }

    total(): number {
        return this.samples.reduce((sum, value) => sum + value, 0);
    }

    summary(): TimingSummary {
        if (this.samples.length === 0) return { count: 0, avgMs: 0, p95Ms: 0, maxMs: 0 };
        const sorted = [...this.samples].sort((a, b) => a - b);
        return {
            count: sorted.length,
            avgMs: round(this.total() / sorted.length),
            p95Ms: round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]),
            maxMs: round(sorted[sorted.length - 1]),
        };
    }
}

export function waitUntil(
    condition: () => boolean,
    options: { label: string | (() => string); timeoutMs?: number },
): Promise<void> {
    const timeoutMs = options.timeoutMs ?? 30_000;
    const startedAt = performance.now();
    return new Promise((resolve, reject) => {
        const check = () => {
            if (condition()) return resolve();
            if (performance.now() - startedAt > timeoutMs) {
                const label = typeof options.label === 'function' ? options.label() : options.label;
                return reject(new Error(`Timeout after ${timeoutMs}ms: ${label}`));
            }
            setTimeout(check, 5);
        };
        check();
    });
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createPRNG(seed: number) {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function onActorMessage(context: ActorContext, callback: (data: AnyData) => void): VoidFunction {
    const listener = (envelope: { data: AnyData }) => callback(envelope.data);
    context.addEventListener('message', listener);
    return () => context.removeEventListener('message', listener);
}
