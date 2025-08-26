import { connectTransmitters } from '../connectTransmitters';
import { createEnvelopeChannel } from '../createEnvelopePort';
import { EnvelopeTransferable } from '../envelope';
import { timeoutProvider } from '../providers';
import { request } from '../request/request';
import { AnyData, EnvelopeMessagePort, EventType, Transmitter } from '../types';
import { createShortRandomString, noop } from '../utils/common';
import { lock, onUnlock } from '../utils/Locks';
import { createRoute } from '../utils/route';
import { post } from '../utils/transmitter';
import { isMessagePortLike } from '../worker/detect';
import { HANDSHAKE } from './defs';
import { ChannelTransmitter } from './types';

export function openChannel(
    target: EnvelopeMessagePort,
    message: AnyData,
    options?: {
        abortSignal?: AbortSignal;
        transferable?: EnvelopeTransferable;
    },
): Promise<ChannelTransmitter> {
    const channelId = createShortRandomString();
    const unlockChannelPromise = lock('openChannel'+channelId);

    return new Promise<ChannelTransmitter>(async (resolve, reject) => {
        const unlockChannel = await unlockChannelPromise;
        const envelope = await request(target, message, { ...options, channelId: createRoute(channelId) });

        if (!isMessagePortLike(envelope.data)) {
            reject(new Error('Invalid handshake response'));
            return;
        }

        const messagePort = envelope.data as MessagePort;
        const localChannel = createEnvelopeChannel();
        const disconnect = connectTransmitters(messagePort as Transmitter, localChannel.port1);
        const close = () => {
            disconnect();
            messagePort.removeEventListener('message', resolveHandshake);
            cleanupController.abort();
            localChannel.port2.destroy();
            messagePort.close();
            unlockChannel();
        }

        // HANDSHAKE
        timeoutProvider.setTimeout(() => messagePort.postMessage(HANDSHAKE));
        const resolveHandshake = (event: MessageEvent) => {
            if (event.data !== HANDSHAKE) return;
            messagePort.removeEventListener('message', resolveHandshake);
            resolve({
                ...localChannel.port2,
                close,
            }as ChannelTransmitter);
        }
        messagePort.addEventListener('message', resolveHandshake);
        
        const cleanupController = new AbortController();
        
        onUnlock('supportChannel'+channelId, cleanupController.signal).then(() => {
            post(localChannel.port1, EventType.Error, new Error('Lose Channel'));
            close();
        }).catch(noop);
    }).catch((err) => {
        unlockChannelPromise.then((unlock) => unlock());
        throw err;
    })
};
