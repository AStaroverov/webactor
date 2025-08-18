import { createDispatch } from '../dispatch';
import { createEnvelope } from '../envelope';
import { Actor, EnvelopeMessagePort } from '../types';
import { threadId } from '../utils/thread';
import { connectActorToMessagePort } from './connectActorToMessagePort';
import { CONNECT_THREAD_TYPE, DISCONNECT_THREAD_TYPE } from './defs';
import { getWorkerMessagePort } from './utils';

export function connectActorToWorker<A extends Actor, W extends Worker | SharedWorker>(
    actor: A,
    worker: W,
) {
    const workerPort = getWorkerMessagePort(worker);
    const dispatchToWorker = createDispatch(workerPort as EnvelopeMessagePort);
    const disconnectTransmitters = connectActorToMessagePort(actor, workerPort);

    dispatchToWorker(createEnvelope(CONNECT_THREAD_TYPE, threadId));

    return () => {
        disconnectTransmitters();
        dispatchToWorker(createEnvelope(DISCONNECT_THREAD_TYPE, threadId));
    };
}

export function connectWorkerToActor<A extends Actor, W extends Worker | SharedWorker>(
    worker: W,
    actor: A,
) {
    return connectActorToWorker(actor, worker);
}
