import { connectActorToWorker } from '.';
import { createEnvelopeChannel } from '../createEnvelopePort';
import { devtools } from '../devtools/internal';
import { Reason, Reasons } from '../reason';
import { request } from '../request/request';
import { Actor } from '../types';
import {
    catchAbortToSymbol,
    createShortRandomString,
    isObject,
    isStringField,
    noop,
    safeShouldRetry,
} from '../utils/common';
import { onUnlock } from '../utils/lock';
import { on } from '../utils/transmitter';
import { THREAD_ID_REQUEST } from './defs';
import { getWorkerMessagePort } from './utils';

export function applyWorkerSupervisor(
    WorkerConstructor: () => Worker,
    {
        shouldRetry,
    }: {
        shouldRetry: (reason?: unknown | Reason | Error | ErrorEvent) => boolean | Promise<boolean>;
    },
): Actor {
    const proxy = createEnvelopeChannel();

    const shouldRestartFor = safeShouldRetry(shouldRetry, false);

    let supervisorClosed = false;
    let closeCurrentWorker: VoidFunction = noop;

    const launchWorker = () => {
        const worker = WorkerConstructor();
        const messagePort = getWorkerMessagePort(worker);
        const abortController = new AbortController();
        let decided = false;
        const decide = async (reason: unknown) => {
            if (decided) return;
            decided = true;
            close();
            if ((await shouldRestartFor(reason)) && !supervisorClosed) {
                devtools.restart(actor, reason);
                launchWorker();
            }
        };
        const onUnlockThreadId = (threadId: string) => {
            onUnlock(threadId, abortController.signal)
                .then(() => decide(Reasons.LostConnection))
                .catch(catchAbortToSymbol);
        };

        request(messagePort, THREAD_ID_REQUEST, { abortSignal: abortController.signal })
            .then((envelope) => {
                if (isObject(envelope.data) && isStringField(envelope.data, 'threadId')) {
                    onUnlockThreadId(envelope.data.threadId);
                }
            })
            .catch(catchAbortToSymbol);

        const errorOff = on(worker, 'error', (error) => decide(error));

        const disconnectTransmitters = connectActorToWorker(proxy.port1 as Actor, worker as Worker | SharedWorker);
        let closed = false;
        const close = () => {
            if (closed) return;
            closed = true;

            disconnectTransmitters();
            worker.terminate();
            errorOff();
            abortController.abort();
        };

        closeCurrentWorker = close;
    };

    const disposes: (() => void)[] = [];

    const launchProxy = () => {
        devtools.state(actor, 'launched');
        launchWorker();
        disposes.push(() => closeCurrentWorker());
        disposes.push(() => proxy.port1.close());
        disposes.push(() => proxy.port2.close());
    };

    const closeProxy = () => {
        supervisorClosed = true;
        devtools.state(actor, 'closed');
        disposes.forEach((dispose) => dispose());
    };

    const name = `WorkerSupervisor<${createShortRandomString()}>`;
    const actor = {
        ...proxy.port2,
        name,
        close: closeProxy,
        launch: launchProxy,
    };

    devtools.registerEnds(actor, proxy.port1, 'supervisor', name);

    return actor;
}
