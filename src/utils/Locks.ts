import { locksProvider, loggerProvider } from '../providers';

const webLocksSupported = globalThis.navigator !== undefined && globalThis.navigator.locks !== undefined;

if (!webLocksSupported && process.env.NODE_ENV !== 'test') {
    loggerProvider.error('navigator.locks is not implemented');
}

export function lock(key: string): Promise<VoidFunction> {
    return new Promise<VoidFunction>((exResolve) => {
        const internalPromise = new Promise((inResolve) => {
            void locksProvider.request(key, () => {
                exResolve(inResolve as VoidFunction);
                return internalPromise;
            });
        });
    });
}

export function onUnlock(key: string, abortSignal?: AbortSignal): Promise<unknown> {
    return new Promise((resolve, reject) => {
        locksProvider.request(key, { signal: abortSignal }, resolve).catch(reject);
    });
};
