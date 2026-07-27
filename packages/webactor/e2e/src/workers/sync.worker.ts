import type { AnyEnvelope } from 'webactor';
import { createActor, createDenseNetwork, useContextMessagePort } from 'webactor';

const PEERS = ['ada', 'grace', 'linus', 'margaret'];

const sync = createActor('sync-hub', (context) => {
    let presenceTick = 0;

    const listener = (envelope: AnyEnvelope) => {
        const data = envelope.data as { type?: string } | null;
        if (data?.type === 'presence') {
            context.postMessage({ type: 'presence-ack', online: PEERS.length, at: Date.now() });
        }
        if (data?.type === 'outgoing') {
            context.postMessage({ type: 'delivered-elsewhere', at: Date.now() });
        }
    };

    const handle = setInterval(
        () => {
            context.postMessage({
                type: 'peer-activity',
                peer: PEERS[presenceTick++ % PEERS.length],
                at: Date.now(),
            });
        },
        4000 + Math.random() * 3000,
    );

    context.addEventListener('message', listener);
    return () => {
        clearInterval(handle);
        context.removeEventListener('message', listener);
    };
});

createDenseNetwork(useContextMessagePort(), sync).launch();
