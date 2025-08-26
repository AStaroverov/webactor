import { createEnvelopeChannel } from './createEnvelopePort';
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
        // @ts-ignore
        port1.removeEventListener('error', postToPort2);
        port1.removeEventListener('message', postToPort2);
        // @ts-ignore
        port1.removeEventListener('messageerror', postToPort2);
        port1.destroy?.();
        port2.destroy?.();
    };

    const launch = () => {
        if (launched) {
            throw new Error(`Retranslator "${name}" is already launched`);
        }
        launched = true;
        
        // @ts-ignore
        port1.addEventListener('error', postToPort2);
        port1.addEventListener('message', postToPort2);
        // @ts-ignore
        port1.addEventListener('messageerror', postToPort2);
        
        return actor;
    };

    const actor: Actor = {
        name,
        launch,
        destroy,
        postMessage: port1.postMessage.bind(port1),
        addEventListener: port2.addEventListener.bind(port2),
        removeEventListener: port2.removeEventListener.bind(port2),
    };

    return actor;
}