import { createDeferredDispatch } from '../dispatch';
import { createEnvelope } from '../envelope';
import { timeoutProvider } from '../providers';
import { createResponseFactory } from '../request/response';
import { createSubscribe } from '../subscribe';
import { EnvelopeTransmitter, ExtractEnvelope, Subscribe, ValueOf } from '../types';
import { sleep } from '../utils';
import { createShortRandomString, noop } from '../utils/common';
import { Defer } from '../utils/Defer';
import { lock, subscribeOnUnlock } from '../utils/Locks';
import { CHANNEL_CLOSE_TYPE, CHANNEL_HANDSHAKE_TYPE, CHANNEL_READY_TYPE, ChannelCloseReason } from './defs';
import type { ChannelDispose, SupportChanelContext } from './types';

export function supportChannelFactory<E extends EnvelopeTransmitter>(transmitter: T) {
    const subscribe = createSubscribe(transmitter);

    return function supportChannel<T extends ExtractEnvelope<E>>(
        target: ExtractEnvelope<T>,
        onOpen: (context: SupportChanelContext<T>) => void | ChannelDispose,
    ) {
        if (target.routePassed === undefined) throw new Error('This envelope cannot be used to support a channel');

        const channelReady = new Defer();
        const channelId = createShortRandomString();
        const handshakeEnvelope = createEnvelope(CHANNEL_HANDSHAKE_TYPE, channelId);
        const unlockResponseSide = lock(channelId);
        const createResponse = createResponseFactory(createDeferredDispatch(transmitter, channelReady.promise));
        const dispatchToChannel = createResponse<T>(target);

        const subscribeToChannel: Subscribe<T> = (callback, withSystemEnvelopes) => {
            return subscribe((envelope) => {
                if (envelope.routeAnnounced?.startsWith(dispatchToChannel.responseName)) {
                    callback(envelope as T);
                }
            }, withSystemEnvelopes);
        };

        let closeChannel: (reason: ValueOf<typeof ChannelCloseReason>) => void;

        const unsubscribeOnReady = subscribeToChannel((envelope) => {
            if (envelope.type === CHANNEL_READY_TYPE) {
                channelReady.resolve(undefined);
                unsubscribeOnReady();
            }
        }, true);
        const unsubscribeOnCloseChannel = subscribeToChannel(
            (envelope) => envelope.type === CHANNEL_CLOSE_TYPE && closeChannel(ChannelCloseReason.ManualByOpener),
            true,
        );
        const unsubscribeOnChannelTerminate = subscribeOnUnlock(target.uniqueId, () => {
            // close message can be in browser queue, so we need to wait a little
            timeoutProvider.setTimeout(() => closeChannel(ChannelCloseReason.LoseChannel), 1000);
        });

        dispatchToChannel(handshakeEnvelope);

        const dispose = onOpen({ dispatch: dispatchToChannel, subscribe: subscribeToChannel });

        closeChannel = (reason: ValueOf<typeof ChannelCloseReason>) => {
            closeChannel = noop;

            unsubscribeOnChannelTerminate();
            unsubscribeOnCloseChannel();
            unsubscribeOnReady();
            dispose?.(reason);

            if (reason === ChannelCloseReason.ManualBySupporter) {
                Promise.race([channelReady.promise, sleep(1000)]).then(() => {
                    dispatchToChannel(createEnvelope(CHANNEL_CLOSE_TYPE, undefined) as T);
                });
            }

            timeoutProvider.setTimeout(unlockResponseSide, 1000);
        };

        dispatchToChannel(createEnvelope(CHANNEL_READY_TYPE, undefined) as T);

        return () => {
            closeChannel(ChannelCloseReason.ManualBySupporter);
        };
    };
}
