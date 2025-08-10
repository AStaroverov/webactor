import { Observable } from 'rxjs';

export type Nil = null | undefined | void;

export type ThreadId = string;

export type ValueOf<T> = T[keyof T];

export type Mailbox<T> = {
    destroy?: () => void;
    dispatch: (envelope: T) => unknown;
    subscribe: (callback: SubscribeCallback<T, void>) => VoidFunction;
};

export type Envelope<T extends string, P, Tr extends undefined | Transferable[] = undefined> = {
    type: T;
    payload: P;
    transferable?: Tr;
    uniqueId: string;
    threadId: ThreadId;
};

export type Message = string | object;
export type DataEvent = MessageEvent | ExtendableMessageEvent;

export type AnyEnvelope = Envelope<any, any>;
export type UnknownEnvelope = Envelope<string, unknown>;

export type DispatchOptions = {
    ackTimeout: number;
    targetTimeout: number;
};

export type Dispatch<T> = (message: T) => unknown;
export type Dispatch$<T> = (message: T) => Observable<unknown>;

export type Subscribe<T, E extends void | DataEvent> = (callback: SubscribeCallback<T, E>) => VoidFunction;
export type SubscribeCallback<T, E extends void | DataEvent> = (message: T, event: E) => unknown;
export type Subscribe$<E extends AnyEnvelope> = (type: E['type']) => Observable<E>;

export type WithDispatch<T> = {
    dispatch: Dispatch<T>;
};

export type WithSubscribe<T> = {
    subscribe: Subscribe<T, void>;
};

export type WithDispatch$<T> = {
    dispatch: Dispatch$<T>;
};

export type WithSubscribe$<T> = {
    subscribe: Subscribe$<T>;
};

export type Actor<In, Out> = {
    name: string;
    launch: () => Actor<In, Out>;
    destroy: () => void;
};

export type ActorContext<In, Out> = WithDispatch$<Out> &
    WithSubscribe$<In> & {
        name: string;
    };

export interface PostMessageLike<T extends Message> {
    postMessage(mssg: T, transferable?: StructuredSerializeOptions): void;
    postMessage(mssg: T, transferable?: Transferable): void;
    postMessage(mssg: T, transferable?: Transferable[]): void;
}

export type EventListenerLike<E extends void | DataEvent> = {
    start?: () => void;
    addEventListener: (type: string, callback: (event: E) => unknown) => void;
    removeEventListener: (type: string, callback: (event: E) => unknown) => void;
};

export type MessagePortLike<T extends Message = Message, E extends DataEvent = DataEvent>
    = PostMessageLike<T> & EventListenerLike<E>;

export type EnvelopeDispatchTarget<T extends Message> =
    | Pick<Mailbox<T>, 'dispatch'>
    | WithDispatch<T>
    | PostMessageLike<T>;

export type EnvelopeSubscribeSource<T extends Message, E extends void | DataEvent> =
    | Pick<Mailbox<T>, 'subscribe'>
    | WithSubscribe<T>
    | EventListenerLike<E>;
