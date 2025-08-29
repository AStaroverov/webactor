import { Reason } from "./reason";
import { AnyData, TransferableOptions, ValueOf } from "./types";
import { Route } from "./utils/route";

export const EnvelopeType = {
    Error: 'error',
    Close: 'close',
    Message: 'message',
} as const;

export type EnvelopeTypes = ValueOf<typeof EnvelopeType>
export type Envelope<T> = {
    readonly type: EnvelopeTypes;
    readonly data: T;
    readonly transferable?: TransferableOptions;

    // Internal routing information
    __route: undefined | Route;
    __checkpoints: undefined | Route;
}

export type AnyEnvelope = Envelope<AnyData>;
export type ErrorEnvelope = Envelope<AnyData>;
export type CloseEnvelope = Envelope<{ reason?: Reason, source?: AnyData }>;

export function isEnvelope(v: unknown): v is AnyEnvelope {
    return (typeof v === "object" && v !== null && "__route" in v && "__checkpoints" in v);
}

export function createEnvelope<T>(type: EnvelopeTypes, data: T, transferable?: TransferableOptions, options?: {
    route?: Route;
    checkpoints?: Route;
}): Envelope<T> {
    return {
        type,
        data,
        transferable,
        __route: options?.route,
        __checkpoints: options?.checkpoints,
    };
}

export function shallowCopyEnvelope<T extends AnyEnvelope>(v: T): T {
    return <T>{
        type: v.type,
        data: v.data,
        transferable: v.transferable,
        __route: v.__route,
        __checkpoints: v.__checkpoints,
    };
}