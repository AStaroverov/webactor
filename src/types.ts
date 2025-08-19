import { ChannelCloseEnvelope, ChannelHandshakeEnvelope, ChannelReadyEnvelope } from './channel/defs';

export type ValueOf<T> = T[keyof T];

export type Message = string | object;

export interface DispatchLike<T extends Event> {
    (event: T): unknown;
}

export interface EventDispatchLike<T extends Message> {
    dispatchEvent: DispatchLike<Event | MessageEvent<T> | MessageEvent<Error>>;
}   

export interface PostMessageLike<T extends Message> {
    (mssg: T): unknown
    (mssg: T, options: StructuredSerializeOptions): unknown
    (mssg: T, transferable: Transferable): unknown
    (mssg: T, transferable: Transferable[]): unknown
}

export interface EventPostLike<T extends Message> {
    close?: () => void
    postMessage: PostMessageLike<T>
}

export interface ListenerLike<T extends Message, E extends Error = Error> {
    (type: 'message', callback: (event: MessageEvent<T>) => unknown): void
    (type: 'messageerror', callback: (event: MessageEvent<E>) => unknown): void
}

export interface EventListenerLike<T extends Message, E extends Error = Error> {
    start?: () => void;
    addEventListener: ListenerLike<T, E>
    removeEventListener: ListenerLike<T, E>
}

export interface EventTargetLike<T extends Message, E extends Error = Error> extends EventDispatchLike<T>, EventListenerLike<T, E> {};
export interface MessagePortLike<T extends Message, E extends Error = Error> extends EventPostLike<T>, EventTargetLike<T, E> {};

export interface EnvelopeTarget<T extends AnyEnvelope = AnyEnvelope> extends EventPostLike<T>, EventDispatchLike<T> {};
export interface EnvelopeSource<T extends AnyEnvelope = AnyEnvelope> extends EventListenerLike<T> {};
export interface EnvelopeMessagePort<T extends AnyEnvelope = AnyEnvelope> extends MessagePortLike<T> { };

export interface Mailbox<T extends AnyEnvelope = AnyEnvelope> extends EnvelopeMessagePort<T> {
    destroy?: () => void;
};

export type Envelope<T extends string, P> = {
    type: T;
    payload: P;
    transferable: undefined | Transferable | Transferable[] | StructuredSerializeOptions;

    uniqueId: string;
    threadId: string;
    // channelId: string;
    
    routePassed: undefined | string;
    routeAnnounced: undefined | string;
};

export type AnyEnvelope = Envelope<any, any>;
export type UnknownEnvelope = Envelope<string, unknown>;
export type SystemEnvelope = ChannelHandshakeEnvelope | ChannelReadyEnvelope | ChannelCloseEnvelope;

export type Dispatch<T extends AnyEnvelope> = (envelope: T | SystemEnvelope) => unknown;
export type Subscribe<T extends AnyEnvelope> = <F extends false | true | void = false>(
    callback: SubscribeCallback<F extends true ? T | SystemEnvelope : T>,
    withSystemEnvelopes?: F,
) => Function;
export type SubscribeCallback<T extends AnyEnvelope> = (envelope: T) => unknown;

export type EventSubscribe<T extends AnyEnvelope> = <F extends false | true | void = false>(
    type: 'message' | 'messageerror',
    callback: SubscribeCallback<F extends true ? T | SystemEnvelope : T>,
    withSystemEnvelopes?: F,
) => Function;

export type EnvelopeTransmitter<T extends AnyEnvelope = AnyEnvelope> = EnvelopeSource<T> & EnvelopeTarget<T>;

export type Actor<T extends AnyEnvelope = AnyEnvelope> =
    EnvelopeTransmitter<T> & {
        name: string;
        launch: () => Actor<T>;
        destroy: () => void;
    };

export type ActorContext<T extends AnyEnvelope = AnyEnvelope> = EnvelopeTransmitter<T> & {
        name: string;
    };

export type ExtractEnvelope<T> = T extends EnvelopeTransmitter<infer T> ? T : never;
