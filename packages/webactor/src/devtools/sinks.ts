import { timeoutProvider } from '../providers';
import { threadId } from '../utils/thread';
import { option } from './options';
import type { DevtoolsEvent, DevtoolsSink } from './types';

const sinks = new Set<DevtoolsSink>();
const relaySinks = new Set<DevtoolsSink>();

let active = false;
let pending: DevtoolsEvent[] = [];
let flushHandle: number | undefined;

export function isActive(): boolean {
    return active;
}

export function hasSinks(): boolean {
    return sinks.size > 0;
}

export function hasLocalSink(): boolean {
    return sinks.size > relaySinks.size;
}

export function addSink(sink: DevtoolsSink, options?: { relay?: boolean }): VoidFunction {
    sinks.add(sink);
    if (options?.relay === true) relaySinks.add(sink);
    active = true;
    return () => {
        sinks.delete(sink);
        relaySinks.delete(sink);
        active = sinks.size > 0;
    };
}

export function deliver(batch: DevtoolsEvent[], path: string[]): void {
    for (const sink of sinks) {
        try {
            sink(batch, path);
        } catch {
            sinks.delete(sink);
            relaySinks.delete(sink);
        }
    }
    active = sinks.size > 0;
}

export function flush(): void {
    if (flushHandle !== undefined) {
        timeoutProvider.clearTimeout(flushHandle);
        flushHandle = undefined;
    }
    if (pending.length === 0) return;
    const batch = pending;
    pending = [];
    deliver(batch, [threadId]);
}

export function queue(event: DevtoolsEvent): void {
    pending.push(event);
    if (pending.length >= option('maxBatch')) {
        flush();
        return;
    }
    if (flushHandle === undefined) {
        flushHandle = timeoutProvider.setTimeout(flush, option('flushInterval'));
    }
}

export function dropQueued(): void {
    pending = [];
}
