import type { ScenarioResult } from '../harness';
import { round, sleep } from '../harness';
import { runWave } from './actor-lifecycle';

export type MemoryLeakConfig = {
    cycles: number;
    actorsPerCycle: number;
    messagesPerPair: number;
};

export const memoryLeakDefaults: MemoryLeakConfig = {
    cycles: 6,
    actorsPerCycle: 400,
    messagesPerPair: 5,
};

const forceGC = (globalThis as { gc?: () => void }).gc;

async function measureHeap(): Promise<number> {
    if (forceGC) {
        forceGC();
        await sleep(50);
        forceGC();
        await sleep(50);
    }
    const memory = (performance as { memory?: { usedJSHeapSize: number } }).memory;
    return memory?.usedJSHeapSize ?? 0;
}

export async function runMemoryLeak(overrides: Partial<MemoryLeakConfig> = {}): Promise<ScenarioResult> {
    const { cycles, actorsPerCycle, messagesPerPair } = { ...memoryLeakDefaults, ...overrides };
    const startedAt = performance.now();

    const counters: Record<string, number> = {
        gcAvailable: forceGC ? 1 : 0,
        actorsChurned: 0,
    };

    let heapAfterFirstCycle = 0;
    let heapAfterLastCycle = 0;

    for (let cycle = 0; cycle < cycles; cycle++) {
        const stats = await runWave(`mem-${cycle}`, actorsPerCycle, messagesPerPair);
        counters.actorsChurned += stats.actorsCreated;
        const heap = await measureHeap();
        counters[`heapAfterCycle${cycle}`] = heap;
        if (cycle === 0) heapAfterFirstCycle = heap;
        heapAfterLastCycle = heap;
    }

    counters.heapAfterFirstCycle = heapAfterFirstCycle;
    counters.heapAfterLastCycle = heapAfterLastCycle;
    counters.heapGrowthBytes = heapAfterLastCycle - heapAfterFirstCycle;

    return {
        scenario: 'memory-leak',
        config: { cycles, actorsPerCycle, messagesPerPair },
        durationMs: round(performance.now() - startedAt),
        counters,
        timings: {},
        errors: [],
    };
}
