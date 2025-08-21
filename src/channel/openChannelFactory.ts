import { timeoutProvider } from '../providers';
import { request } from '../request/request';
import { EventType, EventTypes, Message, MessagePortLike } from '../types';
import { createEventId, noop } from '../utils/common';
import { lock, onUnlock } from '../utils/Locks';
import { isMessagePortLike } from '../worker/detect';
import { HANDSHAKE } from './defs';
import { ChannelTransmitter } from './types';

export function openChannel<T extends Message>(
    target: MessagePortLike<T>,
    message: T,
    options?: {
        abortSignal?: AbortSignal;
    },
): Promise<ChannelTransmitter> {
    const channelId = createEventId();
    const unlockChannelPromise = lock('openChannel'+channelId);

    return new Promise(async (resolve, reject) => {
        const unlockChannel = await unlockChannelPromise;
        const event = await request(
            target,
            message,
            { id: channelId, abortSignal: options?.abortSignal }
        )

        if (!isMessagePortLike(event.data)) {
            reject(new Error('Invalid handshake response'));
            return;
        }

        const port = event.data as MessagePortLike<Message>;

        port.start?.();

        const errorHandlers = new Set<(event: MessageEvent<Error>) => unknown>();
        const addEventListener = (type: EventTypes, handler: (event: MessageEvent) => unknown) => {
            if (type === EventType.Error) {
                errorHandlers.add(handler);
            }
            // @ts-expect-error
            port.addEventListener(type, handler);
        }
        const removeEventListener = (type: EventTypes, handler: (event: MessageEvent) => unknown) => {
            if (type === EventType.Error) {
                errorHandlers.delete(handler);
            }
            // @ts-expect-error
            port.removeEventListener(type, handler);
        }

        // HANDSHAKE
        timeoutProvider.setTimeout(() => port.postMessage(HANDSHAKE));
        const resolveHandshake = (event: MessageEvent) => {
            if (event.data !== HANDSHAKE) return;
            port.removeEventListener('message', resolveHandshake);
            resolve({
                postMessage: port.postMessage.bind(port),
                dispatchEvent: port.dispatchEvent.bind(port),
                addEventListener,
                removeEventListener,
                close
            });
        }
        port.addEventListener('message', resolveHandshake);
        
        const cleanupController = new AbortController();
        const close = () => {
            port.removeEventListener('message', resolveHandshake);
            cleanupController.abort();
            unlockChannel();
            port.close?.();
        }
        
        onUnlock('supportChannel'+channelId, cleanupController.signal).then(() => {
            const error = new MessageEvent(EventType.Error, { data: new Error('Lose Channel') });
            errorHandlers.forEach(handler => handler(error));
            close();
        }).catch(noop);
    }).catch((err) => {
        unlockChannelPromise.then((unlock) => unlock());
        throw err;
    })
};
