import { createEnvelopeChannel } from './createEnvelopePort';
import { devtools } from './devtools/internal';
import { EnvelopeType } from './envelope';
import { Actor } from './types';

export interface RetranslatorOptions {
    name?: string;
}

export function createRetranslator(options: RetranslatorOptions = {}): Actor {
    const { name = 'retranslator' } = options;

    const { port1, port2 } = createEnvelopeChannel();

    let launched = false;
    let closed = false;

    const postToPort2 = port2.postMessage.bind(port2);

    const close = () => {
        if (closed) return;
        closed = true;
        devtools.state(actor, 'closed');
        // @ts-ignore
        port1.removeEventListener(EnvelopeType.Close, postToPort2);
        // @ts-ignore
        port1.removeEventListener(EnvelopeType.Message, postToPort2);
        port1.close?.();
        port2.close?.();
    };

    const launch = () => {
        if (launched) return;
        launched = true;
        devtools.state(actor, 'launched');

        // @ts-ignore
        port1.addEventListener(EnvelopeType.Close, postToPort2);
        // @ts-ignore
        port1.addEventListener(EnvelopeType.Message, postToPort2);

        return actor;
    };

    const actor: Actor = {
        name,
        close,
        launch,
        postMessage: port1.postMessage.bind(port1),
        addEventListener: port2.addEventListener.bind(port2),
        removeEventListener: port2.removeEventListener.bind(port2),
    };

    devtools.register([actor, port1, port2], 'retranslator', name);

    return actor;
}
