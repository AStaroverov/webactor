import { connectEnvelopeTransmitter } from '../connectEnvelopeTransmitter';
import { type Actor, type Message, type MessagePortLike } from '../types';

export function connectActorToMessagePort<A extends Actor, P extends MessagePortLike<Message>>(
    actor: A,
    port: P,
): VoidFunction {
    return connectEnvelopeTransmitter(actor, port as MessagePortLike<Message>);
}
export function connectMessagePortToActor<A extends Actor, P extends MessagePortLike<Message>>(
    port: P,
    actor: A,
) {
    return connectActorToMessagePort(actor, port);
}
