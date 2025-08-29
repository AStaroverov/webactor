import { AnyEnvelope, createEnvelope, Envelope, EnvelopeTypes, isEnvelope } from "./envelope";
import { AnyData, EnvelopeEmitter, EventType, TransferableOptions } from "./types";

export function createEnvelopeEmitter<T extends AnyData>(): EnvelopeEmitter<Envelope<T>> {
    const callbacksRecord: Map<EnvelopeTypes, Set<(event: any) => unknown>> = new Map();

    function addEventListener(type: EnvelopeTypes, callback: (event: any) => unknown): void {
        if (!callbacksRecord.has(type)) {
            callbacksRecord.set(type, new Set());
        }
        callbacksRecord.get(type)!.add(callback);
    }

    function removeEventListener(type: EnvelopeTypes, callback: (event: any) => unknown): void {
        if (callbacksRecord.has(type)) {
            callbacksRecord.get(type)!.delete(callback);
        }
    }

    function callCallbacks(envelope: AnyEnvelope): void {
        void Promise.resolve().then(() => {
            if (!callbacksRecord.has(envelope.type)) return;
            for (let callback of callbacksRecord.get(envelope.type)!) {
                // @ts-ignore
                callback(envelope);
            }
        });
    }

    return {
        close() {
            void Promise.resolve().then(() => {
                callbacksRecord.clear();
            });
        },
        postMessage(message: T | Envelope<T>, transferable?: TransferableOptions): void {
            const envelope = isEnvelope(message) ? message : createEnvelope(
                EventType.Message,
                message,
                transferable
            );

            callCallbacks(envelope);
        },
        addEventListener,
        removeEventListener,
    };
};
