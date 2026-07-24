import { connectTransmitters } from './connectTransmitters';
import { createEnvelopeChannel } from './createEnvelopePort';
import { CloseEnvelope, ErrorEnvelope } from './envelope';
import { Reason } from './reason';
import { Actor } from './types';
import { createShortRandomString, noop, safeShouldRetry } from './utils/common';
import { on } from './utils/transmitter';

export function applyActorSupervisor(
    ActorConstructor: () => Actor,
    {
        shouldRetry,
    }: {
        shouldRetry: (reason?: unknown | Reason) => boolean | Promise<boolean>;
    },
): Actor {
    const proxy = createEnvelopeChannel();

    const shouldRestartFor = safeShouldRetry(shouldRetry, false);

    let supervisorClosed = false;
    let closeCurrentActor: VoidFunction = noop;

    const launchActor = () => {
        const actor = ActorConstructor();
        let decided = false;
        const decide = async (reason: unknown) => {
            if (decided) return;
            decided = true;
            close();
            if ((await shouldRestartFor(reason)) && !supervisorClosed) {
                launchActor();
            }
        };
        const closeOff = on<CloseEnvelope>(actor, 'close', (envelope) => decide(envelope.data.reason));
        const errorOff = on<ErrorEnvelope>(actor, 'error', (envelope) => decide(envelope.data));
        const disconnectTransmitters = connectTransmitters(actor, proxy.port1, ['message']);
        let closed = false;
        const close = () => {
            if (closed) return;
            closed = true;
            disconnectTransmitters();
            actor.close();
            closeOff();
            errorOff();
        };

        closeCurrentActor = close;
        actor.launch();
    };

    const disposes: (() => void)[] = [];

    const launchProxy = () => {
        launchActor();
        disposes.push(() => closeCurrentActor());
        disposes.push(() => proxy.port1.close());
        disposes.push(() => proxy.port2.close());
    };

    const closeProxy = () => {
        supervisorClosed = true;
        disposes.forEach((dispose) => dispose());
    };

    const actor = {
        ...proxy.port2,
        name: `ActorSupervisor<${createShortRandomString()}>`,
        close: closeProxy,
        launch: launchProxy,
    };

    return actor;
}
