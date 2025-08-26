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

    const destroy = () => {
        if (destroyed) {
            throw new Error(`Retranslator "${name}" is already destroyed`);
        }
        destroyed = true;
        port1.destroy?.();
        port2.destroy?.();
    };

    const launch = () => {
        if (launched) {
            throw new Error(`Retranslator "${name}" is already launched`);
        }
        launched = true;
        
        port1.addEventListener('error', port2.postMessage.bind(port2));
        port1.addEventListener('message', port2.postMessage.bind(port2));
        port1.addEventListener('messageerror', port2.postMessage.bind(port2));
        
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