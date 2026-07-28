import { AnyEnvelope, CloseEnvelope, Envelope, EnvelopeType, ErrorEnvelope, MessageErrorEnvelope } from './envelope';
import { Reason } from './reason';

export type ValueOf<T> = T[keyof T];

export const EventType = {
    // Exit: 'exit', add support native node worker
    Error: 'error',
    Message: 'message',
    MessageError: 'messageerror',
} as const;

export type EventTypes = ValueOf<typeof EventType>;
export type ErrorEventTypes = typeof EventType.Error | typeof EventType.MessageError;

export type AnyData =
    | Error
    | Transferable
    | number
    | string
    | boolean
    | null
    | undefined
    | AnyData[]
    | { [key: string]: AnyData };
export type Message = AnyData;
export type TransferableOptions = undefined | Transferable[] | StructuredSerializeOptions;

export interface PostMessageLike<T> {
    (mssg: T): unknown;
    (mssg: T, none?: undefined): unknown;
    (mssg: T, options: TransferableOptions): unknown;
}

export interface PostLike<T> {
    close?: () => void;
    postMessage: PostMessageLike<T>;
}

// EVENT LIKE
export interface EventListener<T extends Message> {
    (type: typeof EventType.Error, callback: (event: ErrorEvent) => unknown): void;
    (type: typeof EventType.Message, callback: (event: MessageEvent<T>) => unknown): void;
    (type: typeof EventType.MessageError, callback: (event: MessageEvent<Error>) => unknown): void;
}
export interface EventListenerLike<T extends Message> {
    start?: () => void;
    addEventListener: EventListener<T>;
    removeEventListener: EventListener<T>;
}
export interface EventTargetLike<T extends Message> extends PostLike<T> {}
export interface EventSourceLike<T extends Message> extends EventListenerLike<T> {}
export interface EventMessagePortLike<T extends Message> extends EventTargetLike<T>, EventSourceLike<T> {}

// ENVELOPE LIKE
export interface EnvelopeListener<T extends AnyEnvelope> {
    (type: typeof EnvelopeType.Close, callback: (envelope: CloseEnvelope) => unknown): void;
    (type: typeof EnvelopeType.Error, callback: (envelope: ErrorEnvelope) => unknown): void;
    (type: typeof EnvelopeType.Message, callback: (envelope: T) => unknown): void;
    (type: typeof EnvelopeType.MessageError, callback: (envelope: MessageErrorEnvelope) => unknown): void;
}
export interface EnvelopeListenerLike<T extends AnyEnvelope> {
    start?: () => void;
    addEventListener: EnvelopeListener<T>;
    removeEventListener: EnvelopeListener<T>;
}
export interface EnvelopeTarget<T extends AnyEnvelope = AnyEnvelope> extends PostLike<
    T | (T extends Envelope<infer U> ? U : never)
> {}
export interface EnvelopeSource<T extends AnyEnvelope = AnyEnvelope> extends EnvelopeListenerLike<T> {}
export interface EnvelopeMessagePort<T extends AnyEnvelope = AnyEnvelope>
    extends EnvelopeTarget<T>, EnvelopeSource<T> {}

// ACTOR
export interface EnvelopeEmitter<T extends AnyEnvelope = AnyEnvelope> extends EnvelopeMessagePort<T> {
    close: () => void;
}

// Transmitter
export type TransmitterTarget<T extends AnyData = AnyData> = EventTargetLike<T> | EnvelopeTarget<Envelope<T>>;
export type TransmitterSource<T extends AnyData = AnyData> = EventSourceLike<T> | EnvelopeSource<Envelope<T>>;
export type Transmitter<T extends AnyData = AnyData> = EventMessagePortLike<T> | EnvelopeMessagePort<Envelope<T>>;

export type Actor<T extends AnyEnvelope = AnyEnvelope> = EnvelopeEmitter<T> & {
    name: string;
    close: (reason?: unknown | Reason) => void;
    launch: () => void;
};

export type ActorContext<T extends AnyEnvelope = AnyEnvelope> = EnvelopeEmitter<T> & {
    name: string;
    close: (reason?: unknown | Reason) => void;
};
