import { connectActorToWorker } from ".";
import { createEnvelopeChannel } from "../createEnvelopePort";
import { Reason, Reasons } from "../reason";
import { request } from "../request/request";
import { Actor } from "../types";
import { catchAbortToSymbol, createShortRandomString, isObject, isStringField, safeShouldRetry } from "../utils/common";
import { onUnlock } from "../utils/lock";
import { on } from "../utils/transmitter";
import { THREAD_ID_REQUEST } from "./defs";
import { getWorkerMessagePort } from "./utils";

export function applyWorkerSupervisor(WorkerConstructor: () => Worker, { shouldRetry }: {
    shouldRetry: (reason?: unknown | Reason | Error | ErrorEvent) => boolean | Promise<boolean>;
}): Actor {
    const proxy = createEnvelopeChannel();

    const shouldRestartFor = safeShouldRetry(shouldRetry, false);

    const launchWorker = () => {
        const worker = WorkerConstructor();
        const messagePort = getWorkerMessagePort(worker);
        const abortController = new AbortController();
        const onUnlockThreadId = (threadId: string) => {
            onUnlock(threadId, abortController.signal)
                .finally(close)
                .then(() => shouldRestartFor(Reasons.LostConnection))
                .then((shouldRestart) => shouldRestart && launchWorker())
                .catch(catchAbortToSymbol)
        }

        request(messagePort, THREAD_ID_REQUEST, { abortSignal: abortController.signal })
            .then((envelope) => {
                if (isObject(envelope.data) && isStringField(envelope.data, 'threadId')) {
                    onUnlockThreadId(envelope.data.threadId);
                }
            })
            .catch(catchAbortToSymbol)

        const errorOff = on(worker, 'error', async (error) => {
            close();
            if (await shouldRestartFor(error)) {
                launchWorker()
            }
        });

        const disconnectTransmitters = connectActorToWorker(proxy.port1 as Actor, worker as Worker | SharedWorker);
        let closed = false;
        const close = () => {
            if (closed) return;
            closed = true;

            disconnectTransmitters();
            worker.terminate();
            errorOff();
            abortController.abort();
        }

        return close;
    }

    const disposes: (() => void)[] = [];

    const launchProxy = () => {
        disposes.push(launchWorker());
        disposes.push(() => proxy.port1.close());
        disposes.push(() => proxy.port2.close());
    }

    const closeProxy = () => {
        disposes.forEach(dispose => dispose());
    }

    const actor = {
        ...proxy.port2,
        name: `WorkerSupervisor<${createShortRandomString()}>`,
        close: closeProxy,
        launch: launchProxy,
    };

    return actor;
}
