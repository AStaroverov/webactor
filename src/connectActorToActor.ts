import { connectTransmitters } from './connectTransmitters';
import type { Actor, ActorContext } from './types';

export function connectActorToActor<A extends Actor | ActorContext, B extends Actor | ActorContext>(
    actor1: A,
    actor2: B,
) {
    return connectTransmitters(actor1, actor2);
}
