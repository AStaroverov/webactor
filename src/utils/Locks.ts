
import { locksProvider, loggerProvider } from '../providers';
const webLocksSupported = globalThis.navigator !== undefined && globalThis.navigator.locks !== undefined;

if (!webLocksSupported && process.env.NODE_ENV !== 'test') {
    loggerProvider.error('navigator.locks is not implemented');
}

export function lock(key: string): Promise<VoidFunction> {
    return new Promise<VoidFunction>((exResolve, exReject) => {
        locksProvider.request(key, () => {
            return new Promise((resolve) => {
                exResolve(resolve as VoidFunction);
            });
        }).catch(exReject);
    });
}

export function onUnlock(key: string, abortSignal?: AbortSignal): Promise<unknown> {
    return new Promise((resolve, reject) => {
        void locksProvider.request(key, { signal: abortSignal }, () => {
            resolve(undefined);
            return Promise.resolve();
        }).catch(reject);
    });
};
