import { response } from '../request/response';
import { EventType, EventTypes, Message, MessagePortLike } from '../types';
import { noop } from '../utils/common';
import { lock, onUnlock } from '../utils/Locks';
import { reasonToError } from '../worker/error';
import { HANDSHAKE } from './defs';
import type { ChannelTransmitter } from './types';

export function supportChannel<T extends Message>(
    target: MessagePortLike<Message>,
    event: MessageEvent<Message>,
    options?: {
        abortSignal?: AbortSignal;
    },
): Promise<ChannelTransmitter> {
    return new Promise(async (resolve, reject) => {
        const abortChannel = () => {
            reject(reasonToError(options?.abortSignal?.reason, 'Support channel aborted'));
        }
        options?.abortSignal?.addEventListener('abort', abortChannel, { once: true });

        const messageChannel = new MessageChannel();
        response(target, event, messageChannel.port1);

        const unlockChannel = await lock('supportChannel'+event.origin);

        if (options?.abortSignal?.aborted) {
            unlockChannel();
            return;
        }
        
        const errorHandlers = new Set<(event: MessageEvent<Error>) => unknown>();
        const addEventListener = (type: EventTypes, handler: (event: MessageEvent) => unknown) => {
            if (type === EventType.Error) {
                errorHandlers.add(handler);
            }
            // @ts-expect-error
            messageChannel.port2.addEventListener(type, handler);
        }
        const removeEventListener = (type: EventTypes, handler: (event: MessageEvent) => unknown) => {
            if (type === EventType.Error) {
                errorHandlers.delete(handler);
            }
            // @ts-expect-error
            messageChannel.port2.removeEventListener(type, handler);
        }
        const handshake = () => {
            messageChannel.port2.postMessage(HANDSHAKE);
            resolve({
                postMessage: messageChannel.port2.postMessage.bind(messageChannel.port2),
                dispatchEvent: messageChannel.port2.dispatchEvent.bind(messageChannel.port2),
                addEventListener,
                removeEventListener,
                close
            });
        }
        const abortController = new AbortController();
        const close = () => {
            options?.abortSignal?.removeEventListener('abort', abortChannel);
            abortController.abort();
            messageChannel.port1.close();
            messageChannel.port2.close();
            messageChannel.port2.removeEventListener('message', handshake);
            unlockChannel();
        }

        messageChannel.port2.addEventListener('message', handshake, { once: true });
        
        onUnlock('openChannel'+event.origin, abortController.signal).then(() => {
            const error = new MessageEvent(EventType.Error, { data: new Error('Lose Channel') });
            errorHandlers.forEach(handler => handler(error));
            close();
        }).catch(noop);
    });
};
