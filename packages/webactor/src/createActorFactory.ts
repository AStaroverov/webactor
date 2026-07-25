import { createEnvelopeChannel } from './createEnvelopePort';
import { devtools } from './devtools/recorder';
import { AnyEnvelope, EnvelopeType } from './envelope';
import { Reason } from './reason';
import { Actor, ActorContext, AnyData } from './types';
import { post } from './utils/transmitter';

type ActorConstructor = (context: ActorContext<AnyEnvelope>) => unknown | Function;

export function createActorFactory(options: { createChannel: () => ReturnType<typeof createEnvelopeChannel> }) {
    return function createActor(name: string, constructor: ActorConstructor): Actor {
        const { port1, port2 } = options.createChannel();

        let launched = false;
        let closed = false;
        let dispose: unknown | Function;

        const close = (reason?: unknown | Reason) => {
            if (closed) return;
            closed = true;

            post(port1, EnvelopeType.Close, { reason: reason as AnyData });

            devtools.state(actor, 'closed');

            port1.close?.();
            port2.close?.();
            if (typeof dispose === 'function') dispose();
        };

        const context: ActorContext<AnyEnvelope> = {
            name,
            close,
            postMessage: port1.postMessage.bind(port1),
            addEventListener: port1.addEventListener.bind(port1),
            removeEventListener: port1.removeEventListener.bind(port1),
        };

        const launch = () => {
            if (launched || closed) return;
            dispose = constructor(context);
            launched = true;
            devtools.state(actor, 'launched');
        };

        const actor: Actor = {
            name,
            launch,
            close,
            postMessage: port2.postMessage.bind(port2),
            addEventListener: port2.addEventListener.bind(port2),
            removeEventListener: port2.removeEventListener.bind(port2),
        };

        devtools.register([actor, context, port1, port2], 'actor', name);

        return actor;
    };
}
