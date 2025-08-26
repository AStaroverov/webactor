import { connectTransmitters } from '../connectTransmitters';
import { createEnvelopeChannel } from '../createEnvelopePort';
import { Envelope } from '../envelope';
import { response } from '../request/response';
import { AnyData, EnvelopeMessagePort, EventType, Transmitter } from '../types';
import { noop } from '../utils/common';
import { lock, onUnlock } from '../utils/Locks';
import { getFirstRouteCheckpoint } from '../utils/route';
import { post } from '../utils/transmitter';
import { HANDSHAKE } from './defs';
import type { ChannelTransmitter } from './types';

export function supportChannel(
    target: EnvelopeMessagePort,
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

        const unlockChannel = await lock('supportChannel'+channelId);
        const localChannel = createEnvelopeChannel();
        const disconnect = connectTransmitters(messageChannel.port2 as Transmitter, localChannel.port1);
        const abortController = new AbortController();
        const close = () => {
            disconnect();
            abortController.abort();
            localChannel.port1.destroy();
            localChannel.port2.destroy();
            messageChannel.port1.close();
            messageChannel.port2.close();
            messageChannel.port2.removeEventListener('message', handshake);
            unlockChannel();
        }

        const handshake = () => {
            messageChannel.port2.postMessage(HANDSHAKE);
            resolve({
                ...localChannel.port2,
                close
            } as ChannelTransmitter);
        }
        
        messageChannel.port2.addEventListener('message', handshake, { once: true });
        
        onUnlock('openChannel'+channelId, abortController.signal).then(() => {
            post(localChannel.port1, EventType.Error, new Error('Lose Channel'));
            close();
        }).catch(noop);
    });
};
