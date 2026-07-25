import { connectTransmitters } from './connectTransmitters';
import { createEnvelopeChannel } from './createEnvelopePort';
import { devtools } from './devtools/internal';
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
        const child = ActorConstructor();
        let decided = false;
        const decide = async (reason: unknown) => {
            if (decided) return;
            decided = true;
            close();
            if ((await shouldRestartFor(reason)) && !supervisorClosed) {
                devtools.restart(actor, reason);
                launchActor();
            }
        };
        const closeOff = on<CloseEnvelope>(child, 'close', (envelope) => decide(envelope.data.reason));
        const errorOff = on<ErrorEnvelope>(child, 'error', (envelope) => decide(envelope.data));
        const disconnectTransmitters = connectTransmitters(child, proxy.port1, ['message']);
        let closed = false;
        const close = () => {
            if (closed) return;
            closed = true;
            disconnectTransmitters();
            child.close();
            closeOff();
            errorOff();
        };

        closeCurrentActor = close;
        child.launch();
    };

    const disposes: (() => void)[] = [];

    const launchProxy = () => {
        devtools.state(actor, 'launched');
        launchActor();
        disposes.push(() => closeCurrentActor());
        disposes.push(() => proxy.port1.close());
        disposes.push(() => proxy.port2.close());
    };

    const closeProxy = () => {
        supervisorClosed = true;
        devtools.state(actor, 'closed');
        disposes.forEach((dispose) => dispose());
    };

    const name = `ActorSupervisor<${createShortRandomString()}>`;
    const actor = {
        ...proxy.port2,
        name,
        close: closeProxy,
        launch: launchProxy,
    };

    devtools.register([actor, proxy.port1, proxy.port2], 'supervisor', name);

    return actor;
}
