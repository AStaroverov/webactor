import { AnyData, EventType, EventTypes } from "./types";
import { createShortRandomString } from "./utils/common";

export type Envelope<T> = {
    __: true
    id: string;
    type: EventTypes;
    data: T;
    channelId?: string;
    transferable?: Transferable[] | StructuredSerializeOptions;
}

export type AnyEnvelope = Envelope<AnyData>;

export function isEnvelope(v: unknown): v is AnyEnvelope {
    return (typeof v === "object" && v !== null && "__" in v);
}

export function isErrorEnvelope(v: unknown): v is Envelope<Error> {
    return isEnvelope(v) && (v.type === EventType.Error || v.type === EventType.MessageError);
}

export function createEnvelope<T>(type: EventTypes, data: T, options?: { id?: string; channelId?: string; transferable?: undefined | Transferable[] | StructuredSerializeOptions }): Envelope<T> {
    const id = options?.id ?? createShortRandomString();
    return {
        __: true,
        id,
        type,
        data,
        channelId: options?.channelId,
        transferable: options?.transferable
    };
}
