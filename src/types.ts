import { Envelope, EnvelopeTransferable } from "./envelope";

export type ValueOf<T> = T[keyof T];

export const EventType = {
    Error: 'error',
    Message: 'message',
    MessageError: 'messageerror'
} as const;

export type EventTypes = ValueOf<typeof EventType>;
export type ErrorEventTypes = typeof EventType.Error | typeof EventType.MessageError;

export type AnyData = Transferable | number | string | boolean | null | undefined | AnyData[] | { [key: string]: AnyData };
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

export interface ListenerLike<T, E> {
    (type: typeof EventType.Error, callback: (event: E) => unknown): void
    (type: typeof EventType.Message, callback: (event: T) => unknown): void
    (type: typeof EventType.MessageError, callback: (event: E) => unknown): void
}

// EVENT LIKE
export interface EventListenerLike<T extends Message> {
    start?: () => void;
    addEventListener: ListenerLike<MessageEvent<T>, MessageEvent<Error> | ErrorEvent>
    removeEventListener: ListenerLike<MessageEvent<T>, MessageEvent<Error> | ErrorEvent>
}
export interface EventTargetLike<T extends Message> extends PostLike<T> {};
export interface EventSourceLike<T extends Message> extends EventListenerLike<T> {};
export interface EventMessagePortLike<T extends Message> extends EventTargetLike<T>, EventSourceLike<T> {};

// ENVELOPE LIKE
export interface EnvelopeListenerLike<T extends AnyData> {
    start?: () => void;
    addEventListener: ListenerLike<Envelope<T>, Error | ErrorEvent>
    removeEventListener: ListenerLike<Envelope<T>, Error | ErrorEvent>
}
export interface EnvelopeTarget<T extends AnyData = AnyData> extends PostLike<T | Envelope<T>> {};
export interface EnvelopeSource<T extends AnyData = AnyData> extends EnvelopeListenerLike<T> {};
export interface EnvelopeMessagePort<T extends AnyData = AnyData> extends EnvelopeTarget<T>, EnvelopeSource<T> {};

// ACTOR
export interface EnvelopeEmitter<T extends AnyData = AnyData> extends EnvelopeMessagePort<T> {
    destroy?: () => void;
};

// Transmitter
export type TransmitterTarget<T extends AnyData = AnyData> = EventTargetLike<T> | EnvelopeTarget<T>;
export type TransmitterSource<T extends AnyData = AnyData> = EventSourceLike<T> | EnvelopeSource<T>;
export type Transmitter<T extends AnyData = AnyData> =  EventMessagePortLike<T> | EnvelopeMessagePort<T>;


export type Actor<T extends AnyData = AnyData> = EnvelopeEmitter<T> & {
    name: string;
    launch: () => void;
    destroy: () => void;
};

export type ActorContext<T extends AnyData = AnyData> = EnvelopeEmitter<T> & {
    name: string;
};
