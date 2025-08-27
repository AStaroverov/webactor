import { AnyEnvelope, createEnvelope, Envelope, EnvelopeTypes, isEnvelope } from "../envelope";
import { AnyData, EventTypes, Transmitter, TransmitterSource, TransmitterTarget } from "../types";
import { createPointerId } from "./createPointerId";
import { threadId } from "./thread";

export function post<T extends EnvelopeTypes, V extends AnyData>(
    target: TransmitterTarget<V>,
    type: T,
    value: V | Envelope<V> | MessageEvent<V> | MessageEvent<Envelope<V>>,
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

export function on<T extends EventTypes | EnvelopeTypes, V extends AnyData>(
    source: TransmitterSource<V>,
    type: T,
    callback: (value: V) => void,
): VoidFunction {
    source.start?.();

    const handler = (value: Error | ErrorEvent | AnyData | AnyEnvelope | MessageEvent<Error | AnyData | AnyEnvelope>) => {
        if (value instanceof MessageEvent) {
            value = value.data;
        }
        callback(value as V)
    };

    // @ts-ignore
    source.addEventListener(type, handler);
    // @ts-ignore
    return () => source.removeEventListener(type, handler);
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