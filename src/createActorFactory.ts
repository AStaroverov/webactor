import { createEnvelopeChannel } from './createEnvelopePort';
import { Actor, ActorContext, AnyData } from './types';

type ActorConstructor = (
    context: ActorContext<AnyData>,
) => unknown | Function;

export function createActorFactory(options: { createChannel: () => ReturnType<typeof createEnvelopeChannel> }) {
    return function createActor(
        name: string,
        constructor: ActorConstructor,
    ): Actor<AnyData> {
        const { port1, port2 } = options.createChannel();
        
        let launched = false;
        let destroyed = false;
        let dispose: unknown | Function;

        const destroy = () => {
            if (destroyed) {
                throw new Error(`Actor "${name}" is already destroyed`);
            }
            destroyed = true;
            port1.destroy?.();
            port2.destroy?.();
            typeof dispose === 'function' && dispose();
        };

        const launch = () => {
            if (launched) {
                throw new Error(`Actor "${name}" is already launched`);
            }
            dispose = constructor({
                name,
                postMessage: port1.postMessage.bind(port1),
                addEventListener: port1.addEventListener.bind(port1),
                removeEventListener: port1.removeEventListener.bind(port1),
            });
            launched = true;
        };
    
        const actor: Actor = {
            name,
            launch,
            destroy,
            postMessage: port2.postMessage.bind(port2),
            addEventListener: port2.addEventListener.bind(port2),
            removeEventListener: port2.removeEventListener.bind(port2),
        };

        return actor;
    };
}
