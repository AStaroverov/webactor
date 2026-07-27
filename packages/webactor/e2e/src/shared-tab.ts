import type { AnyData } from 'webactor';
import { connectActorToWorker, createActor } from 'webactor';
import { onActorMessage } from './harness';

let received = 0;
let tabId = -1;
let send: (payload: AnyData) => void = () => {
    throw new Error('shared tab is not connected');
};

function connect(id: number): void {
    tabId = id;
    const worker = new SharedWorker(new URL('./workers/broadcast.worker.ts', import.meta.url), {
        type: 'module',
        name: 'load-broadcast',
    });
    const client = createActor(`tab-${id}`, (context) => {
        send = (payload) => context.postMessage(payload);
        return onActorMessage(context, (data) => {
            if ((data as { type: string }).type === 'echo') received += 1;
        });
    });
    connectActorToWorker(client, worker);
    client.launch();
}

window.__sharedTab = {
    connect,
    send: (count: number) => {
        for (let seq = 0; seq < count; seq++) {
            send({ type: 'msg', tab: tabId, seq });
        }
    },
    stats: () => ({ received }),
};
