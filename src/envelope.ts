import { AnyData, EventType, EventTypes } from "./types";
import { Route } from "./utils/route";


export type EnvelopeTransferable = undefined | Transferable[] | StructuredSerializeOptions;
export type Envelope<T> = {
    readonly __: true
    readonly type: EventTypes;
    readonly data: T;
    readonly transferable?: EnvelopeTransferable;

    // Internal routing information
    __route: undefined | Route;
    __checkpoints: undefined | Route;
}

export type AnyEnvelope = Envelope<AnyData>;

export function isEnvelope(v: unknown): v is AnyEnvelope {
    return (typeof v === "object" && v !== null && "__" in v);
}

export function isErrorEnvelope(v: unknown): v is Envelope<Error> {
    return isEnvelope(v) && (v.type === EventType.Error || v.type === EventType.MessageError);
}
export function createEnvelope<T>(type: EventTypes, data: T, transferable?: EnvelopeTransferable, options?: {
    route?: Route;
    checkpoints?: Route;
}): Envelope<T> {
    return {
        __: true,
        type,
        data,
        transferable,
        __route: options?.route,
        __checkpoints: options?.checkpoints,
    };
}

export function shallowCopyEnvelope<T extends AnyEnvelope>(v: T): T {
    return <T>{
        __: true,
        type: v.type,
        data: v.data,
        transferable: v.transferable,
        __route: v.__route,
        __checkpoints: v.__checkpoints,
    };
}