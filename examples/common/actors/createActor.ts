import type { AnyEnvelope, Mailbox } from '../../../src';
import { createActorFactory } from '../../../src';

const a = new EventTarget();

export const createMailbox = <T extends AnyEnvelope>(): Mailbox<T> => {
    const mssgCallbacks = new Set<(event: MessageEvent<T>) => unknown>();
    const errCallbacks = new Set<(event: MessageEvent<T>) => unknown>();

    function addEventListener(type: 'message', callback: (event: MessageEvent<T>) => unknown): void
    function addEventListener(type: 'messageerror', callback: (event: MessageEvent<Error>) => unknown): void;
    function addEventListener(type: string, callback: (event: MessageEvent<any>) => unknown): void {
        if (type === 'message') {
            mssgCallbacks.add(callback);
        } else if (type === 'messageerror') {
            errCallbacks.add(callback);
        } else {
            throw new Error(`Unsupported event type: ${type}`);
        }
    }

    function removeEventListener(type: 'message', callback: (event: MessageEvent<T>) => unknown): void
    function removeEventListener(type: 'messageerror', callback: (event: MessageEvent<Error>) => unknown): void;
    function removeEventListener(type: string, callback: (event: MessageEvent<any>) => unknown): void {
        if (type === 'message') {
            mssgCallbacks.delete(callback);
        } else if (type === 'messageerror') {
            errCallbacks.delete(callback);
        } else {
            throw new Error(`Unsupported event type: ${type}`);
        }
    }

    return {
        destroy() {
            mssgCallbacks.clear();
            errCallbacks.clear();
        },
        dispatchEvent(event: Event | MessageEvent<T> | MessageEvent<Error>) {
            const type = event.type;
            const callbacks = type === 'message' ? mssgCallbacks : errCallbacks;

            for (let callback of callbacks) {
                callback(event as Parameters<typeof callback>[0]);
            }
        },
        postMessage(mssg: T) {
            const current = Array.from(mssgCallbacks);
            const event = new MessageEvent('message', { data: mssg });
            for (let callback of current) {
                callback(event);
            }
        },
        addEventListener,
        removeEventListener,
    };
};
export const createActor = createActorFactory({ getMailbox: () => createMailbox() });
