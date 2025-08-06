export const identity = <T = any>(v: T) => v;
export const noop = (): any => {};

export function createShortRandomString() {
    return Math.round(Math.random() * Date.now()).toString(32);
}

export function isObject(v: unknown): v is object {
    return typeof v === 'object' && v !== null;
}
