import { Reason } from "./def";
import { Envelope, EnvelopeTransferable, EnvelopeType } from "./envelope";

export type ValueOf<T> = T[keyof T];

export const EventType = {
    // Exit: 'exit', add support native node worker
    Error: 'error',
    Message: 'message',
    MessageError: 'messageerror'
} as const;

export type EventTypes = ValueOf<typeof EventType>;
export type ErrorEventTypes = typeof EventType.Error | typeof EventType.MessageError;

export type AnyData = Error | Transferable | number | string | boolean | null | undefined | AnyData[] | { [key: string]: AnyData };
export type Message = AnyData;

export interface PostMessageLike<T> {
    (mssg: T): unknown
    (mssg: T, none?: undefined): unknown
    (mssg: T, options: EnvelopeTransferable): unknown
}

export interface PostLike<T> {
    close?: () => void
    postMessage: PostMessageLike<T>
}

// EVENT LIKE
export interface EventListener<T> {
    (type: typeof EventType.Error, callback: (event: ErrorEvent) => unknown): void
    (type: typeof EventType.Message, callback: (event: MessageEvent<T>) => unknown): void
    (type: typeof EventType.MessageError, callback: (event: MessageEvent<Error>) => unknown): void
}
export interface EventListenerLike<T extends Message> {
    start?: () => void;
    addEventListener: EventListener<T>
    removeEventListener: EventListener<T>
}
export interface EventTargetLike<T extends Message> extends PostLike<T> { };
export interface EventSourceLike<T extends Message> extends EventListenerLike<T> { };
export interface EventMessagePortLike<T extends Message> extends EventTargetLike<T>, EventSourceLike<T> { };

// ENVELOPE LIKE
export interface EnvelopeListener<T> {
    (type: typeof EnvelopeType.Close, callback: (reason?: Envelope<{ reason: Reason, source?: AnyData }>) => unknown): void
    (type: typeof EnvelopeType.Message, callback: (envelope: Envelope<T>) => unknown): void
}
export interface EnvelopeListenerLike<T extends AnyData> {
    start?: () => void;
    addEventListener: EnvelopeListener<T>
    removeEventListener: EnvelopeListener<T>
}
export interface EnvelopeTarget<T extends AnyData = AnyData> extends PostLike<T | Envelope<T>> { };
export interface EnvelopeSource<T extends AnyData = AnyData> extends EnvelopeListenerLike<T> { };
export interface EnvelopeMessagePort<T extends AnyData = AnyData> extends EnvelopeTarget<T>, EnvelopeSource<T> { };

// ACTOR
export interface EnvelopeEmitter<T extends AnyData = AnyData> extends EnvelopeMessagePort<T> {
    close: () => void;
};

// Transmitter
export type TransmitterTarget<T extends AnyData = AnyData> = EventTargetLike<T> | EnvelopeTarget<T>;
export type TransmitterSource<T extends AnyData = AnyData> = EventSourceLike<T> | EnvelopeSource<T>;
export type Transmitter<T extends AnyData = AnyData> = EventMessagePortLike<T> | EnvelopeMessagePort<T>;


export type Actor<T extends AnyData = AnyData> = EnvelopeEmitter<T> & {
    name: string;
    close: (reason?: Reason) => void;
    launch: () => void;
};

export type ActorContext<T extends AnyData = AnyData> = EnvelopeEmitter<T> & {
    name: string;
    close: (reason?: Reason) => void;
};
