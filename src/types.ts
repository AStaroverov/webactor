import { ChannelCloseEnvelope, ChannelHandshakeEnvelope, ChannelReadyEnvelope } from './channel/defs';

export type ValueOf<T> = T[keyof T];

export type Mailbox<T extends AnyEnvelope = AnyEnvelope> = {
    destroy?: () => void;
    dispatch: (envelope: T) => unknown;
    subscribe: (callback: SubscribeCallback<T>) => Function;
};

export type Envelope<T extends string, P> = {
    type: T;
    payload: P;
    transferable: undefined | Transferable[];

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

export type WithDispatch<T extends AnyEnvelope> = {
    dispatch: Dispatch<T>;
};

export type WithSubscribe<T extends AnyEnvelope> = {
    subscribe: Subscribe<T>;
};

export type Actor<In extends AnyEnvelope = AnyEnvelope, Out extends AnyEnvelope = AnyEnvelope> = WithDispatch<In> &
    WithSubscribe<Out> & {
        name: string;
        launch: () => Actor<In, Out>;
        destroy: () => void;
    };

export type ActorContext<
    In extends AnyEnvelope = AnyEnvelope,
    Out extends AnyEnvelope = AnyEnvelope,
> = WithDispatch<Out> &
    WithSubscribe<In> & {
        name: string;
    };

export type EnvelopeTransmitter<In extends AnyEnvelope = AnyEnvelope, Out extends AnyEnvelope = AnyEnvelope> =
    | Actor<In, Out>
    | ActorContext<In, Out>
    | (EnvelopeSubscribeSource<In> & EnvelopeDispatchTarget<Out>);

export type ExtractEnvelopeIn<T> = T extends EnvelopeTransmitter<infer In, any> ? In : never;
export type ExtractEnvelopeOut<T> = T extends EnvelopeTransmitter<any, infer Out> ? Out : never;

export type EnvelopeDispatchTarget<T extends AnyEnvelope = AnyEnvelope> =
    | Pick<Mailbox<T>, 'dispatch'>
    | WithDispatch<T>
    | MessagePort;

export type EnvelopeSubscribeSource<T extends AnyEnvelope = AnyEnvelope> =
    | Pick<Mailbox<T>, 'subscribe'>
    | WithSubscribe<T>
    | MessagePort;

export type ExtractEnvelope<T> = T extends EnvelopeDispatchTarget<infer E>
    ? E
    : T extends EnvelopeSubscribeSource<infer E>
    ? E
    : never;
