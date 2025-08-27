import { createEnvelopeChannel } from "./createEnvelopePort";
import { ReasonReacord, Reasons } from "./def";
import { isEnvelope } from "./envelope";
import { Actor } from "./types";
import { createShortRandomString, noop } from "./utils/common";
import { onUnlock } from "./utils/Locks";
import { getLastRouteCheckpoint } from "./utils/route";
import { on } from "./utils/transmitter";
import { connectActorToWorker } from "./worker";

export function applyWorkerSupervisor(WorkerConstructor: () => Worker, { shouldRetry }: {
    shouldRetry: (reason?: unknown | Reasons) => boolean | Promise<boolean>;
}): Actor {
    const proxy = createEnvelopeChannel();

    const launchWorker = () => {
        const worker = WorkerConstructor();
        const errorOff = on<ErrorEvent>(worker, 'error', async (error) => {
            const shouldRestart = await shouldRetry(error);
            if (!shouldRestart) return;
            close();
            launchWorker();
        });

        const abortController = new AbortController();
        const off = on(worker, 'message', (data: unknown) => {
            if (!isEnvelope(data) || typeof data.__checkpoints !== 'string') return;
            const workerPortCheckpoint = getLastRouteCheckpoint(data.__checkpoints);
            if (workerPortCheckpoint.length === 0) return;
            off();
            onUnlock(workerPortCheckpoint, abortController.signal).catch(noop).then(async () => {
                const shouldRestart = await shouldRetry(ReasonReacord.LostWorker);
                if (!shouldRestart) return;
                close();
                launchWorker();
            });
        });
        const disconnectTransmitters = connectActorToWorker(proxy.port1 as Actor, worker as Worker | SharedWorker);
        const close = () => {
            errorOff();
            abortController.abort();
            disconnectTransmitters();
            worker.terminate();
        }

        actor.launch();
        return close;
    }

    const disposes: ((reason?: unknown) => void)[] = [];

    const launchProxy = () => {
        disposes.push(launchWorker());
        disposes.push(() => proxy.port1.close());
        disposes.push(() => proxy.port2.close());
    }

    const closeProxy = (reason?: unknown | Reasons) => {
        disposes.forEach(dispose => dispose(reason));
    }

    const actor = {
        ...proxy.port2,
        name: `WorkerSupervisor<${createShortRandomString()}>`,
        close: closeProxy,
        launch: launchProxy,
    };

    return actor;
}
