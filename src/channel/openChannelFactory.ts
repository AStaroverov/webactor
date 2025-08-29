import { connectTransmitters } from '../connectTransmitters';
import { createEnvelopeChannel } from '../createEnvelopePort';
import { EnvelopeType } from '../envelope';
import { timeoutProvider } from '../providers';
import { Reason, Reasons } from '../reason';
import { request } from '../request/request';
import { AnyData, EventType, TransferableOptions, Transmitter } from '../types';
import { catchAbortToSymbol, createShortRandomString } from '../utils/common';
import { lock, onUnlock } from '../utils/lock';
import { createRoute } from '../utils/route';
import { post } from '../utils/transmitter';
import { isMessagePortLike } from '../worker/detect';
import { HANDSHAKE } from './defs';
import { ChannelTransmitter } from './types';

export function openChannel(
    target: Transmitter,
    message: AnyData,
    options?: {
        abortSignal?: AbortSignal;
        transferable?: TransferableOptions;
    },
): Promise<ChannelTransmitter> {
    const channelId = createShortRandomString();
    const unlockChannelPromise = lock('openChannel' + channelId);

    return new Promise<ChannelTransmitter>(async (resolve, reject) => {
        const unlockChannel = await unlockChannelPromise;
        const envelope = await request(target, message, { ...options, channelId: createRoute(channelId) });

        if (!isMessagePortLike(envelope.data)) {
            reject(new Error('Invalid handshake response'));
            return;
        }

        const messagePort = envelope.data as MessagePort;
        const localChannel = createEnvelopeChannel();
        const disconnect = connectTransmitters(messagePort as Transmitter, localChannel.port1, [EnvelopeType.Message, EnvelopeType.Close]);
        const close = (reason?: Reason) => {
            post(localChannel.port1, EnvelopeType.Close, { reason, source: 'openChannel' });
            post(localChannel.port2, EnvelopeType.Close, { reason, source: 'openChannel' });
            disconnect();
            messagePort.removeEventListener(EventType.Message, resolveHandshake);
            cleanupController.abort();
            localChannel.port2.close();
            messagePort.close();
            unlockChannel();
        }

        // HANDSHAKE
        timeoutProvider.setTimeout(() => messagePort.postMessage(HANDSHAKE));
        const resolveHandshake = (event: MessageEvent) => {
            if (event.data !== HANDSHAKE) return;
            messagePort.removeEventListener(EventType.Message, resolveHandshake);
            resolve({
                ...localChannel.port2,
                close,
            } as ChannelTransmitter);
        }
        messagePort.addEventListener(EventType.Message, resolveHandshake);

        const cleanupController = new AbortController();

        onUnlock('supportChannel' + channelId, cleanupController.signal)
            .then(() => close(Reasons.LostConnection))
            .catch(catchAbortToSymbol);
    }).catch((err) => {
        unlockChannelPromise.then((unlock) => unlock());
        throw err;
    })
};
