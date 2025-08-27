import { connectTransmitters } from '../connectTransmitters';
import { Actor } from '../types';
import { getWorkerMessagePort } from './utils';

export function connectActorToWorker<A extends Actor, W extends Worker | SharedWorker>(
    actor: A,
    worker: W,
) {
    const workerPort = getWorkerMessagePort(worker);
    return connectTransmitters(actor, workerPort);
}

export function connectWorkerToActor<A extends Actor, W extends Worker | SharedWorker>(
    worker: W,
    actor: A,
) {
    return connectActorToWorker(actor, worker);
}
