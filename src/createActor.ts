import { createActorFactory } from './createActorFactory';
import { EventType, EventTypes, Mailbox, Message } from './types';

export const createMailbox = <T extends Message>(): Mailbox<T> => {
    const errorCallbacks = new Set<(event: MessageEvent<Error>) => unknown>();
    const messageCallbacks = new Set<(event: MessageEvent<T>) => unknown>();
    const messageErrorCallbacks = new Set<(event: MessageEvent<Error>) => unknown>();
    const callbacksRecord = {
        [EventType.Error]: errorCallbacks,
        [EventType.Message]: messageCallbacks,
        [EventType.MessageError]: messageErrorCallbacks,
    }

    function addEventListener(type: 'error', callback: (event: MessageEvent<Error>) => unknown): void
    function addEventListener(type: 'message', callback: (event: MessageEvent<T>) => unknown): void
    function addEventListener(type: 'messageerror', callback: (event: MessageEvent<Error>) => unknown): void;
    function addEventListener(type: EventTypes, callback: (event: MessageEvent<any>) => unknown): void {
        const callbacks = callbacksRecord[type];
        if (callbacks == null) {
            throw new Error(`Unsupported event type: ${type}`);
        }
        callbacks.add(callback);
    }

    function removeEventListener(type: 'error', callback: (event: MessageEvent<Error>) => unknown): void
    function removeEventListener(type: 'message', callback: (event: MessageEvent<T>) => unknown): void
    function removeEventListener(type: 'messageerror', callback: (event: MessageEvent<Error>) => unknown): void;
    function removeEventListener(type: EventTypes, callback: (event: MessageEvent<any>) => unknown): void {
        const callbacks = callbacksRecord[type];
        if (callbacks == null) {
            throw new Error(`Unsupported event type: ${type}`);
        }
        callbacks.delete(callback);
    }

    return {
        destroy() {
            errorCallbacks.clear();
            messageCallbacks.clear();
            messageErrorCallbacks.clear();
        },
        dispatchEvent(event: Event | MessageEvent<T> | MessageEvent<Error>) {
            const type = event.type as EventTypes;
            const callbacks = callbacksRecord[type];

            if (callbacks == null) {
                throw new Error(`Unsupported event type: ${type}`);
            }

            for (let callback of callbacks) {
                // @ts-ignore
                callback(event);
            }
        },
        // @TODO: implement transferable
        postMessage(mssg: T) {
            const current = Array.from(messageCallbacks);
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
