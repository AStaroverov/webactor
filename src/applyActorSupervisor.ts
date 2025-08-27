import { connectTransmitters } from "./connectTransmitters";
import { createEnvelopeChannel } from "./createEnvelopePort";
import { Reason, Reasons } from "./def";
import { Actor } from "./types";
import { createShortRandomString } from "./utils/common";
import { on } from "./utils/transmitter";

export function applyActorSupervisor(ActorConstructor: () => Actor, { shouldRetry }: {
    shouldRetry: (reason?: unknown | Reasons) => boolean;
}): Actor {
    const proxy = createEnvelopeChannel();

    const launchActor = () => {
        const actor = ActorConstructor();
        const closeOff = on(actor, 'close', (reason) => {
            if (!shouldRetry(reason)) return;
            launchActor();
        });
        const errorOff = on(actor, 'error', (error) => {
            if (!shouldRetry(error)) return;
            close(Reason.Restart);
            launchActor();
        });
        const disconnectTransmitters = connectTransmitters(actor, proxy.port1, ['message']);
        const close = (reason?: unknown | Reasons) => {
            closeOff();
            errorOff();
            actor.close(reason);
            disconnectTransmitters();
        }

        actor.launch();
        return close;
    }

    const disposes: ((reason?: unknown) => void)[] = [];

    const launchProxy = () => {
        disposes.push(launchActor());
        disposes.push(() => proxy.port1.close());
        disposes.push(() => proxy.port2.close());
    }

    const closeProxy = (reason?: unknown | Reasons) => {
        disposes.forEach(dispose => dispose(reason));
    }

    const actor = {
        ...proxy.port2,
        name: `ActorSupervisor<${createShortRandomString()}>`,
        close: closeProxy,
        launch: launchProxy,
    };

    return actor;
}
