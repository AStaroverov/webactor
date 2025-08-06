import { locksProvider, loggerProvider, timeoutProvider } from '../providers';
import { Defer } from './Defer';
import { noop } from './common';
import { Observable } from 'rxjs';

const webLocksSupported = globalThis.navigator !== undefined && globalThis.navigator.locks !== undefined;

if (!webLocksSupported && process.env.NODE_ENV !== 'test') {
    loggerProvider.error('navigator.locks is not implemented');
}

export function lock(key: string): Promise<VoidFunction> {
    const externalDefer = new Defer();
    const infinityDefer = new Defer();

    void locksProvider.request(key, () => {
        externalDefer.resolve(undefined);
        return infinityDefer.promise;
    });

    return externalDefer.promise.then(() => infinityDefer.resolve.bind(null, undefined));
}

export const subscribeOnUnlock = function subscribeOnThreadTerminate(value: string, callback: () => void) {
    const locksController = new AbortController();
    // if we call locksProvider.request from 2 threads at same time, it will have unknown order
    // I hope, that setTimeout will help to avoid this and 3000ms is enough
    const delayId = timeoutProvider.setTimeout(() => {
        void locksProvider.request(value, { signal: locksController.signal }, callback).catch(noop);
    }, 300);

    return () => {
        timeoutProvider.clearTimeout(delayId);
        locksController.abort();
    };
};

export const subscribeOnUnlock$ = <T extends string>(value: T): Observable<T> => {
    return new Observable((subscriber) => {
        return subscribeOnUnlock(value, () => subscriber.next(value));
    });
};
