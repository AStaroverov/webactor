import { connectTransmitters } from "./connectTransmitters";
import { createEnvelopeChannel } from "./createEnvelopePort";
import { Reason, ReasonReacord } from "./def";
import { CloseEnvelope, ErrorEnvelope } from "./envelope";
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
            const shouldRestart = await shouldRetry(envelope.data.reason);
            if (!shouldRestart) return;
            launchActor();
        });
        const errorOff = on<ErrorEnvelope>(actor, 'error', async (envelope) => {
            const shouldRestart = await shouldRetry(envelope.data);
            if (!shouldRestart) return;
            close(ReasonReacord.Restart);
            launchActor();
        });
        const disconnectTransmitters = connectTransmitters(actor, proxy.port1, ['message']);
        const close = (reason?: Reason) => {
            closeOff();
            errorOff();
            actor.close(reason);
            disconnectTransmitters();
        }

        actor.launch();
        return close;
    }

    const disposes: ((reason?: Reason) => void)[] = [];

    const launchProxy = () => {
        disposes.push(launchActor());
        disposes.push(() => proxy.port1.close());
        disposes.push(() => proxy.port2.close());
    }

    const closeProxy = (reason?: Reason) => {
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
