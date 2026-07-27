import { addSink, devtools } from './recorder';
import type { DevtoolsOptions, DevtoolsSink, DevtoolsSnapshot } from './types';

export { DEVTOOLS_GLOBAL_KEY, DEVTOOLS_HOOK_KEY } from './defs';
export * from './types';

export function enableDevtools(sink?: DevtoolsSink): VoidFunction {
    return addSink(sink ?? (() => {}));
}

export function isDevtoolsEnabled(): boolean {
    return devtools.active;
}

export function getDevtoolsSnapshot(): DevtoolsSnapshot {
    return devtools.snapshot();
}

export function setDevtoolsOptions(options: Partial<DevtoolsOptions>): void {
    devtools.setOptions(options);
}

export function clearDevtools(): void {
    devtools.clear();
}

export function flushDevtools(): void {
    devtools.flush();
}
