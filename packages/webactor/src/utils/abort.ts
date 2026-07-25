import { Reasons } from '../reason';
import { reasonToError } from './common';

export function raceWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!signal) return promise;
    return new Promise<T>((resolve, reject) => {
        const onAbort = () => reject(reasonToError(signal.reason, Reasons.Abort));
        if (signal.aborted) return onAbort();
        signal.addEventListener('abort', onAbort, { once: true });
        promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
    });
}
