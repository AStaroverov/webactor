import { $Aborted, Reasons } from '../reason';

export const identity = <T = any>(v: T) => v;
export const noop = (): any => {};

export function createRandomNumber() {
    return Math.random() * Date.now();
}

export function createShortRandomString() {
    return Math.round(createRandomNumber()).toString(32);
}

export function isObject(v: unknown): v is Record<string, unknown> {
    return v != null && typeof v === 'object' && !Array.isArray(v);
}

export function isString(v: unknown): v is string {
    return typeof v === 'string';
}

export function isStringField<T extends Record<string, unknown>, F extends keyof T>(
    obj: T,
    key: F,
): obj is T & Record<F, string> {
    return isObject(obj) && isString(obj[key]);
}

export function isAbort(v: unknown): boolean {
    if (v === Reasons.Abort) return true;
    if (v instanceof Event && v.type === 'abort') return true;
    if (v instanceof Error && v.message === Reasons.Abort) return true;
    if (isObject(v) && v.name === 'AbortError') return true;
    return false;
}

export function catchAbortToSymbol<T>(v: unknown): Promise<typeof $Aborted | T> {
    if (isAbort(v)) return Promise.resolve($Aborted);
    return Promise.reject(v as T);
}

export function safeShouldRetry<A extends unknown[]>(
    shouldRetry: (...args: A) => boolean | Promise<boolean>,
    fallback: boolean,
): (...args: A) => Promise<boolean> {
    return (...args: A) =>
        Promise.resolve()
            .then(() => shouldRetry(...args))
            .catch(() => fallback);
}

export function reasonToError(reason: unknown, fallback: string): Error {
    if (reason instanceof Error) {
        return reason;
    }
    if (reason != null && typeof reason === 'object' && 'message' in reason && typeof reason.message === 'string') {
        return new Error(reason.message);
    }
    if (typeof reason === 'string') {
        return new Error(reason);
    }
    return new Error(fallback, { cause: reason });
}
