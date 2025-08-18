import { connectEnvelopeTransmitter } from '../connectEnvelopeTransmitter';
import type { Actor, EnvelopeMessagePort } from '../types';

export function connectActorToMessagePort<A extends Actor, P extends MessagePort>(
    actor: A,
    port: P,
): Function {
    return connectEnvelopeTransmitter(actor, port as EnvelopeMessagePort);
}

export function connectMessagePortToActor<A extends Actor, P extends MessagePort>(
    port: P,
    actor: A,
): Function {
    return connectActorToMessagePort(actor, port);
}
