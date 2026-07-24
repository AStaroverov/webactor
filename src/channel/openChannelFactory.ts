import { connectTransmitters } from '../connectTransmitters';
import { createEnvelopeChannel } from '../createEnvelopePort';
import { EnvelopeType } from '../envelope';
import { timeoutProvider } from '../providers';
import { Reason, Reasons } from '../reason';
import { request } from '../request/request';
import { AnyData, EventType, TransferableOptions, Transmitter } from '../types';
import { raceWithAbort } from '../utils/abort';
import { catchAbortToSymbol, createShortRandomString, noop, reasonToError } from '../utils/common';
import { lock, onUnlock } from '../utils/lock';
import { createRoute } from '../utils/route';
import { post } from '../utils/transmitter';
import { isMessagePortLike } from '../worker/detect';
import { HANDSHAKE } from './defs';
import { ChannelTransmitter } from './types';

export async function openChannel(
    target: Transmitter,
    message: AnyData,
    options?: {
        abortSignal?: AbortSignal;
        transferable?: TransferableOptions;
    },
): Promise<ChannelTransmitter> {
    const channelId = createShortRandomString();
    const unlockChannelPromise = lock('openChannel' + channelId);

    try {
        const unlockChannel = await unlockChannelPromise;
        const envelope = await request(target, message, { ...options, channelId: createRoute(channelId) });

        if (!isMessagePortLike(envelope.data)) {
            throw new Error('Invalid handshake response');
        }

        const messagePort = envelope.data as MessagePort;
        const localChannel = createEnvelopeChannel();
        const disconnect = connectTransmitters(messagePort as Transmitter, localChannel.port1, [
            EnvelopeType.Message,
            EnvelopeType.Close,
        ]);
        const cleanupController = new AbortController();
        const handshake = Promise.withResolvers<void>();
        let offHandshake: VoidFunction = noop;
        let closed = false;
        const close = (reason?: Reason) => {
            if (closed) return;
            closed = true;
            post(localChannel.port1, EnvelopeType.Close, { reason, source: 'openChannel' });
            post(localChannel.port2, EnvelopeType.Close, { reason, source: 'openChannel' });
            disconnect();
            offHandshake();
            cleanupController.abort();
            localChannel.port2.close();
            messagePort.close();
            unlockChannel();
            handshake.reject(reasonToError(reason, Reasons.Close));
        };

        const onHandshake = (event: MessageEvent) => {
            if (event.data !== HANDSHAKE) return;
            offHandshake();
            handshake.resolve();
        };
        offHandshake = () => messagePort.removeEventListener(EventType.Message, onHandshake);
        messagePort.addEventListener(EventType.Message, onHandshake);

        timeoutProvider.setTimeout(() => messagePort.postMessage(HANDSHAKE));

        onUnlock('supportChannel' + channelId, cleanupController.signal)
            .then(() => close(Reasons.LostConnection))
            .catch(catchAbortToSymbol);

        await raceWithAbort(handshake.promise, options?.abortSignal).catch((error) => {
            close(Reasons.Abort);
            throw error;
        });

        return {
            ...localChannel.port2,
            close,
        } as ChannelTransmitter;
    } catch (err) {
        unlockChannelPromise.then((unlock) => unlock());
        throw err;
    }
}
