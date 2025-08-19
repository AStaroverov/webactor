
export const identity = <T = any>(v: T) => v;
export const noop = (): any => { };

export function createShortRandomString() {
    return Math.round(Math.random() * Date.now()).toString(32);
}

const PREFIX = 'event-';
export function createEventId() {
    return `${PREFIX}${createShortRandomString()}`;
}
export function isEventId(id: string) {
    return id.startsWith(PREFIX);
}