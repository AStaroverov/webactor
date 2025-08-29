import { connectTransmitters } from "./connectTransmitters";
import { createEnvelopeChannel } from "./createEnvelopePort";
import { CloseEnvelope, ErrorEnvelope } from "./envelope";
import { Reason } from "./reason";
import { Actor } from "./types";
import { createShortRandomString } from "./utils/common";
import { on } from "./utils/transmitter";

export function applyActorSupervisor(ActorConstructor: () => Actor, { shouldRetry }: {
    shouldRetry: (reason?: unknown | Reason) => boolean | Promise<boolean>;
}): Actor {
    const proxy = createEnvelopeChannel();

    const launchActor = () => {
        const actor = ActorConstructor();
        const closeOff = on<CloseEnvelope>(actor, 'close', async (envelope) => {
            close();
            if (await shouldRetry(envelope.data.reason)) {
                launchActor();
            }
        });
        const errorOff = on<ErrorEnvelope>(actor, 'error', async (envelope) => {
            close();
            if (await shouldRetry(envelope.data)) {
                launchActor();
            }
        });
        const disconnectTransmitters = connectTransmitters(actor, proxy.port1, ['message']);
        let closed = false;
        const close = () => {
            if (closed) return;
            closed = true;
            disconnectTransmitters();
            actor.close();
            closeOff();
            errorOff();
        }

        actor.launch();
        return close;
    }

    const disposes: (() => void)[] = [];

    const launchProxy = () => {
        disposes.push(launchActor());
        disposes.push(() => proxy.port1.close());
        disposes.push(() => proxy.port2.close());
    }

    const closeProxy = () => {
        disposes.forEach(dispose => dispose());
    }

    const actor = {
        ...proxy.port2,
        name: `ActorSupervisor<${createShortRandomString()}>`,
        close: closeProxy,
        launch: launchProxy,
    };

    return actor;
}
