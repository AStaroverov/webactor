import { Err, ErrCode } from './Error';
import { Defer } from './Defer';
import { timeoutProvider } from '../providers';

export function createPromise<T>(
    callback: (
        resolve: (v: T) => void,
        reject: (err: Err) => void,
        timeout: (ms: number, message: string) => void,
    ) => unknown,
): Promise<T> {
    const defer = new Defer<T>();

    let timeoutId: undefined | number;
    const setTimeoutDelay = (delay: number, message: string) => {
        timeoutId && timeoutProvider.clearTimeout(timeoutId);
        timeoutId = timeoutProvider.setTimeout(() => {
            defer.reject(new Err(ErrCode.Timeout, message));
        }, delay);
    };

    const resolve = (v: T) => {
        timeoutId && timeoutProvider.clearTimeout(timeoutId);
        defer.resolve(v);
    };

    callback(resolve, defer.reject, setTimeoutDelay);

    return defer.promise;
}
