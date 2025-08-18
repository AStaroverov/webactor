import { AnyEnvelope, EventListenerLike, EventPostLike, ValueOf } from '../types';
import { ChannelCloseReason } from './defs';

export type OpenChanelContext<In extends AnyEnvelope, Out extends AnyEnvelope> = EventListenerLike<In> &
    EventPostLike<Out> & { close: VoidFunction };
export type SupportChanelContext<In extends AnyEnvelope, Out extends AnyEnvelope> = EventListenerLike<In> &
    EventPostLike<Out>;

export type ChannelDispose = (reason: ValueOf<typeof ChannelCloseReason>) => void;
