import { createEnvelopeChannel } from './createEnvelopePort';
import { EnvelopeType } from './envelope';
import { Actor, ActorContext, AnyData } from './types';

type ActorConstructor = (context: ActorContext<AnyData>) => unknown | Function;

export function createActorFactory(options: { createChannel: () => ReturnType<typeof createEnvelopeChannel> }) {
    return function createActor(
        name: string,
        constructor: ActorConstructor,
    ): Actor {
        const { port1, port2 } = options.createChannel();

        let launched = false;
        let destroyed = false;
        let dispose: unknown | Function;

        const close = (reason?: unknown) => {
            if (destroyed) {
                throw new Error(`Actor "${name}" is already destroyed`);
            }

            port1.postMessage({ type: EnvelopeType.Close, reason });

            destroyed = true;
            port1.close?.();
            port2.close?.();
            typeof dispose === 'function' && dispose();
        };

        const launch = () => {
            if (launched) {
                throw new Error(`Actor "${name}" is already launched`);
            }
            dispose = constructor({
                name,
                close,
                postMessage: port1.postMessage.bind(port1),
                addEventListener: port1.addEventListener.bind(port1),
                removeEventListener: port1.removeEventListener.bind(port1),
            });
            launched = true;
        };

        const actor: Actor = {
            name,
            launch,
            close,
            postMessage: port2.postMessage.bind(port2),
            addEventListener: port2.addEventListener.bind(port2),
            removeEventListener: port2.removeEventListener.bind(port2),
        };

        return actor;
    };
}
