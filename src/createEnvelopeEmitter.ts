import { createEnvelope, Envelope, isEnvelope } from "./envelope";
import { AnyData, EnvelopeEmitter, EventType, EventTypes } from "./types";

export function createEnvelopeEmitter<T extends AnyData>(): EnvelopeEmitter<T> {
    const callbacksRecord = {
        [EventType.Error]: new Set<(event: Error | ErrorEvent) => unknown>(),
        [EventType.Message]: new Set<(event: Envelope<T>) => unknown>(),
        [EventType.MessageError]: new Set<(event: Error | ErrorEvent) => unknown>(),
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
        void Promise.resolve().then(() => {
            if (callbacksRecord[type] == null) {
                throw new Error(`Unsupported event type: ${type}`);
            }
            const callbacks = callbacksRecord[type];
            
            for (let callback of callbacks) {
                // @ts-ignore
                callback(message);
            }
        });
    }

    return {
        destroy() {
            void Promise.resolve().then(() => {
                callbacksRecord[EventType.Error].clear();
                callbacksRecord[EventType.Message].clear();
                callbacksRecord[EventType.MessageError].clear();
            });
        },
        postMessage(message: Error | ErrorEvent | T | Envelope<T | Error | ErrorEvent>, transferable?: StructuredSerializeOptions | Transferable[]): void {
            const type = isEnvelope(message) ? message.type : EventType.Message;

            if (isEnvelope(message) && message.type !== EventType.Message) {
                callBacks(message.type, message.data as Error | ErrorEvent);
            } else {
                const envelope = isEnvelope(message) ? message : createEnvelope(
                    EventType.Message,
                    message,
                    transferable
                );
                
                callBacks(type, envelope);
            }
        },
        addEventListener,
        removeEventListener,
    };
};
