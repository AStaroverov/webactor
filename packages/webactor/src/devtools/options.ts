import type { DevtoolsOptions } from './types';

const options: DevtoolsOptions = {
    maxNodes: 4000,
    maxLinks: 8000,
    maxMessages: 5000,
    maxChannels: 500,
    previewDepth: 5,
    capturePayload: true,
    flushInterval: 0,
    maxBatch: 400,
};

export function getOptions(): DevtoolsOptions {
    return { ...options };
}

export function setOptions(next: Partial<DevtoolsOptions>): void {
    Object.assign(options, next);
}

export function option<K extends keyof DevtoolsOptions>(key: K): DevtoolsOptions[K] {
    return options[key];
}
