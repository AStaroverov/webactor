export const identity = <T = any>(v: T) => v;
export const noop = (): any => { };

export function createRandomNumber() {
    return Math.random() * Date.now();
}

export function createShortRandomString() {
    return Math.round(createRandomNumber()).toString(32);
}
