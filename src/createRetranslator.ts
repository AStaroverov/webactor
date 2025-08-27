import { createEnvelopeChannel } from './createEnvelopePort';
import { EnvelopeType } from './envelope';
import { Actor } from './types';

export interface RetranslatorOptions {
    name?: string;
}

export function createRetranslator(options: RetranslatorOptions = {}): Actor {
    const { name = 'retranslator' } = options;

    const { port1, port2 } = createEnvelopeChannel();

    let launched = false;
    let destroyed = false;

    const postToPort2 = port2.postMessage.bind(port2);

    const destroy = () => {
        if (destroyed) {
            throw new Error(`Retranslator "${name}" is already destroyed`);
        }
        destroyed = true;
        port1.removeEventListener(EnvelopeType.Close, postToPort2);
        port1.removeEventListener(EnvelopeType.Message, postToPort2);
        port1.close?.();
        port2.close?.();
    };

    const launch = () => {
        if (launched) {
            throw new Error(`Retranslator "${name}" is already launched`);
        }
        launched = true;

        port1.addEventListener(EnvelopeType.Close, postToPort2);
        port1.addEventListener(EnvelopeType.Message, postToPort2);

        return actor;
    };

    const actor: Actor = {
        name,
        launch,
        close: destroy,
        postMessage: port1.postMessage.bind(port1),
        addEventListener: port2.addEventListener.bind(port2),
        removeEventListener: port2.removeEventListener.bind(port2),
    };

    return actor;
}