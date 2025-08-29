import { connectTransmitters } from '../connectTransmitters';
import { createEnvelopeChannel } from '../createEnvelopePort';
import { Envelope, EnvelopeType } from '../envelope';
import { Reason, Reasons } from '../reason';
import { response } from '../request/response';
import { AnyData, EventType, Transmitter } from '../types';
import { catchAbortToSymbol } from '../utils/common';
import { lock, onUnlock } from '../utils/lock';
import { getFirstRouteCheckpoint } from '../utils/route';
import { post } from '../utils/transmitter';
import { HANDSHAKE } from './defs';
import type { ChannelTransmitter } from './types';

export function supportChannel(
    target: Transmitter,
    envelope: Envelope<AnyData>,
): Promise<ChannelTransmitter> {
    const checkpoints = envelope.__checkpoints;
    if (!checkpoints) {
        throw new Error('Invalid envelope: missing checkpoints');
    }
    const channelId = getFirstRouteCheckpoint(checkpoints);
    const messageChannel = new MessageChannel();

    return new Promise(async (resolve, reject) => {
        response(target, envelope, messageChannel.port1, [messageChannel.port1]);

        const unlockChannel = await lock('supportChannel' + channelId);
        const localChannel = createEnvelopeChannel();
        const disconnect = connectTransmitters(messageChannel.port2 as Transmitter, localChannel.port1, [EnvelopeType.Message, EnvelopeType.Close]);
        const abortController = new AbortController();
        const close = (reason?: Reason) => {
            post(localChannel.port1, EnvelopeType.Close, { reason, source: 'supportChannel' });
            post(localChannel.port2, EnvelopeType.Close, { reason, source: 'supportChannel' });
            disconnect();
            abortController.abort();
            localChannel.port1.close();
            localChannel.port2.close();
            messageChannel.port1.close();
            messageChannel.port2.close();
            messageChannel.port2.removeEventListener(EventType.Message, handshake);
            unlockChannel();
        }

        const handshake = () => {
            messageChannel.port2.postMessage(HANDSHAKE);
            resolve({
                ...localChannel.port2,
                close
            } as ChannelTransmitter);
        }

        messageChannel.port2.addEventListener(EventType.Message, handshake, { once: true });

        onUnlock('openChannel' + channelId, abortController.signal)
            .then(() => close(Reasons.LostConnection))
            .catch(catchAbortToSymbol);
    });
};
