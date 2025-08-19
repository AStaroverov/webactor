import { AnyEnvelope, EventListenerLike, EventPostLike, ValueOf } from '../types';
import { ChannelCloseReason } from './defs';

export type OpenChanelContext<T extends AnyEnvelope> = EventListenerLike<T> &
    EventPostLike<T> & { close: VoidFunction };
export type SupportChanelContext<T extends AnyEnvelope> = EventListenerLike<T> &
    EventPostLike<T>;

export type ChannelDispose = (reason: ValueOf<typeof ChannelCloseReason>) => void;
