import { connectTransmitters } from '../connectTransmitters';
import { type Actor, type EventMessagePortLike, type Message } from '../types';

export function connectActorToMessagePort<A extends Actor, P extends EventMessagePortLike<Message>>(
    actor: A,
    port: P,
): VoidFunction {
    return connectTransmitters(actor, port as EventMessagePortLike<Message>);
}
export function connectMessagePortToActor<A extends Actor, P extends EventMessagePortLike<Message>>(
    port: P,
    actor: A,
) {
    return connectActorToMessagePort(actor, port);
}
