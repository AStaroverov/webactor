import { connectTransmitters } from '../connectTransmitters';
import { createEnvelopeChannel } from '../createEnvelopePort';
import { devtools } from '../devtools/internal';
import { Envelope, EnvelopeType } from '../envelope';
import { Reason, Reasons } from '../reason';
import { response } from '../request/response';
import { AnyData, EventType, Transmitter } from '../types';
import { catchAbortToSymbol, noop, reasonToError } from '../utils/common';
import { lockIfAvailable, onUnlock } from '../utils/lock';
import { post } from '../utils/transmitter';
import { getChannelId } from './getChannelId';
import { HANDSHAKE } from './defs';
import type { ChannelTransmitter } from './types';

export async function supportChannel(target: Transmitter, envelope: Envelope<AnyData>): Promise<ChannelTransmitter> {
    const channelId = getChannelId(envelope);
    if (channelId === undefined) {
        throw new Error('Invalid envelope: missing checkpoints');
    }

    const channelName = typeof envelope.data === 'string' ? envelope.data : undefined;
    devtools.channelOpening(channelId, 'support', channelName, target);

    const unlockChannel = await lockIfAvailable('supportChannel' + channelId);
    if (unlockChannel === null) {
        const error = new Error(`Channel is already supported: ${channelId}`);
        devtools.channelState(channelId, 'support', 'failed', error);
        throw error;
    }

    const messageChannel = new MessageChannel();
    devtools.excludeFromBridge(messageChannel.port2);
    response(target, envelope, messageChannel.port1, [messageChannel.port1]);
    const localChannel = createEnvelopeChannel();
    devtools.registerEnds(
        localChannel.port1,
        localChannel.port2,
        'port',
        `supportChannel(${channelName ?? channelId})`,
    );
    devtools.channelEnds(channelId, 'support', channelName, {
        local: [localChannel.port1, localChannel.port2],
        remote: [messageChannel.port2],
    });
    const disconnect = connectTransmitters(messageChannel.port2 as Transmitter, localChannel.port1, [
        EnvelopeType.Message,
        EnvelopeType.Close,
    ]);
    const abortController = new AbortController();
    const handshake = Promise.withResolvers<void>();
    let offHandshake: VoidFunction = noop;
    let closed = false;
    const close = (reason?: Reason) => {
        if (closed) return;
        closed = true;
        devtools.channelState(channelId, 'support', 'closed', reason);
        post(localChannel.port1, EnvelopeType.Close, { reason, source: 'supportChannel' });
        post(localChannel.port2, EnvelopeType.Close, { reason, source: 'supportChannel' });
        disconnect();
        abortController.abort();
        localChannel.port1.close();
        localChannel.port2.close();
        messageChannel.port1.close();
        messageChannel.port2.close();
        offHandshake();
        unlockChannel();
        handshake.reject(reasonToError(reason, Reasons.Close));
    };

    const onHandshake = () => {
        messageChannel.port2.postMessage(HANDSHAKE);
        handshake.resolve();
    };
    offHandshake = () => messageChannel.port2.removeEventListener(EventType.Message, onHandshake);
    messageChannel.port2.addEventListener(EventType.Message, onHandshake, { once: true });

    onUnlock('openChannel' + channelId, abortController.signal)
        .then(() => close(Reasons.LostConnection))
        .catch(catchAbortToSymbol);

    await handshake.promise;

    devtools.channelState(channelId, 'support', 'open');

    return {
        ...localChannel.port2,
        close,
    } as ChannelTransmitter;
}
