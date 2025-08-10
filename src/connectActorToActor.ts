import { connectEnvelopeTransmitter } from './connectEnvelopeTransmitter';
import type { Actor, ActorContext } from './types';

export function connectActorToActor<A extends Actor | ActorContext, B extends Actor | ActorContext>(
    actor1: A,
    actor2: B,
) {
    return connectEnvelopeTransmitter(actor1, actor2);
}
