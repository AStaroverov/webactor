import { AnyEnvelope, createEnvelope, Envelope, isEnvelope } from "../envelope";
import { AnyData, EventType, EventTypes, Transmitter, TransmitterSource, TransmitterTarget } from "../types";
import { createPointerId } from "./createPointerId";
import { threadId } from "./thread";

export function post<T extends EventTypes, V extends AnyData>(
    target: TransmitterTarget<V>,
    type: T,
    value: V | Envelope<V> | MessageEvent<V> | Error | ErrorEvent | MessageEvent<Error>,
): void {
    const isEventMessage = value instanceof MessageEvent;
    const data = (isEventMessage ? value.data : value);
    const message = isEnvelope(data) && data.type === type
        ? data
        : createEnvelope(
            type,
            data
        );
    const transferable = isEnvelope(message) ? message.transferable : undefined;

    // @ts-ignore
    target.postMessage(message as V, transferable as any);
}

export function listen<T extends AnyData>(
    source: TransmitterSource<T>,
    onError: (type: typeof EventType.Error | typeof EventType.MessageError, error: Error | ErrorEvent) => void,
    onMessage: (type: typeof EventType.Message, data: T) => void,
): VoidFunction {
    const map = {
        [EventType.Error]: onError,
        [EventType.Message]: onMessage,
        [EventType.MessageError]: onError
    }

    source.start?.();

    const unsubscribes = Object.values(EventType).map(type => {
        const handler = (value: Error | ErrorEvent | AnyData | AnyEnvelope | MessageEvent<Error | AnyData | AnyEnvelope>) => {
            if (value instanceof MessageEvent) {
                value = value.data;
            }
            // @ts-ignore
            map[type](type, value);
        };

        // @ts-ignore
        source.addEventListener(type, handler);
        // @ts-ignore
        return () => source.removeEventListener(type, handler);
    });

    return () => unsubscribes.forEach(unsub => unsub());
}

export function getTransmitterName(transmitter: Transmitter): string {
    const postfix = '<' + threadId + '-' + createPointerId(transmitter) + '>'
    if ('name' in transmitter && typeof transmitter.name === 'string') {
        return transmitter.name + postfix;
    }
    if (transmitter instanceof MessagePort) {
        return 'MessagePort' + postfix;
    }
    return 'UnknownTransmitter' + postfix;
}