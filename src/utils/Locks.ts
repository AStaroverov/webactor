import { locksProvider, loggerProvider } from '../providers';
import { Defer } from './Defer';

const webLocksSupported = globalThis.navigator !== undefined && globalThis.navigator.locks !== undefined;

if (!webLocksSupported && process.env.NODE_ENV !== 'test') {
    loggerProvider.error('navigator.locks is not implemented');
}

export function lock(key: string): Promise<VoidFunction> {
    const internalDefer = new Defer<void>();
    const externalDefer = new Defer<VoidFunction>();
    void locksProvider.request(key, () => {
        externalDefer.resolve(internalDefer.resolve);
        return internalDefer.promise;
    });
    return externalDefer.promise;
}

export function onUnlock(key: string, abortSignal?: AbortSignal): Promise<unknown> {
    const defer = new Defer<unknown>();
    locksProvider.request(key, { signal: abortSignal }, defer.resolve).catch(defer.reject);
    return defer.promise;
};
