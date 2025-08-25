import { createEnvelope, Envelope, isEnvelope } from "./envelope";
import { AnyData, EnvelopeEmitter, EventType, EventTypes } from "./types";

export function createEnvelopeEmitter<T extends AnyData>(): EnvelopeEmitter<T> {
    const errorCallbacks = new Set<(event: Error | ErrorEvent) => unknown>();
    const messageCallbacks = new Set<(event: Envelope<T>) => unknown>();
    const messageErrorCallbacks = new Set<(event: Error | ErrorEvent) => unknown>();
    const callbacksRecord = {
        [EventType.Error]: errorCallbacks,
        [EventType.Message]: messageCallbacks,
        [EventType.MessageError]: messageErrorCallbacks,
    }

    function addEventListener(type: 'error', callback: (event: Error | ErrorEvent) => unknown): void
    function addEventListener(type: 'message', callback: (event: Envelope<T>) => unknown): void
    function addEventListener(type: 'messageerror', callback: (event: Error | ErrorEvent) => unknown): void;
    function addEventListener(type: EventTypes, callback: (event: any) => unknown): void {
        const callbacks = callbacksRecord[type];
        if (callbacks == null) {
            throw new Error(`Unsupported event type: ${type}`);
        }
        callbacks.add(callback);
    }

    function removeEventListener(type: 'error', callback: (event: Error | ErrorEvent) => unknown): void
    function removeEventListener(type: 'message', callback: (event: Envelope<T>) => unknown): void
    function removeEventListener(type: 'messageerror', callback: (event: Error | ErrorEvent) => unknown): void;
    function removeEventListener(type: EventTypes, callback: (event: any) => unknown): void {
        const callbacks = callbacksRecord[type];
        if (callbacks == null) {
            throw new Error(`Unsupported event type: ${type}`);
        }
        callbacks.delete(callback);
    }

    function callBacks(type: EventTypes, message: unknown): void {
        const callbacks = callbacksRecord[type];
        if (callbacks == null) {
            throw new Error(`Unsupported event type: ${type}`);
        }
        for (let callback of callbacks) {
            // @ts-ignore
            callback(message);
        }
    }

    return {
        destroy() {
            errorCallbacks.clear();
            messageCallbacks.clear();
            messageErrorCallbacks.clear();
        },
        postMessage(message: Error | ErrorEvent | T | Envelope<T | Error | ErrorEvent>, transferable?: StructuredSerializeOptions | Transferable[]): void {
            const type = isEnvelope(message) ? message.type : EventType.Message;

            if (isEnvelope(message) && message.type !== EventType.Message) {
                callBacks(message.type, message.data as Error | ErrorEvent);
                return;
            }

            const envelope = isEnvelope(message) ? message : createEnvelope(
                EventType.Message,
                message,
                { transferable }
            );

            callBacks(type, envelope);
        },
        addEventListener,
        removeEventListener,
    };
};
