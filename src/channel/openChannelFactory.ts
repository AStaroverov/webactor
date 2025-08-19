import { request } from '../request/request';
import { EventType, EventTypes, Message, MessagePortLike } from '../types';
import { createEventId, noop } from '../utils/common';
import { lock, onUnlock } from '../utils/Locks';
import { HANDSHAKE } from './defs';
import { ChannelTransmitter } from './types';

export async function openChannel<T extends Message>(
    target: MessagePortLike<T>,
    message: T,
    options?: {
        abortSignal?: AbortSignal;
    },
): Promise<ChannelTransmitter> {
    const interrupt = new AbortController();
    const abortProxy = () => interrupt.abort();
    options?.abortSignal?.addEventListener('abort', abortProxy);
    
    const channelId = createEventId();
    const unlockChannel = await lock('openChannel'+channelId);
    const event = await request<T, MessagePort>(
        target as MessagePortLike<T & MessagePort>,
        message,
        { id: channelId, abortSignal: interrupt.signal }
    );

    if (event.data instanceof MessagePort) {
        throw new Error('Invalid handshake response');
    }

    const port = event.ports[0] as MessagePort;

    port.start();
    port.postMessage(HANDSHAKE);

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
    const close = () => {
        unlockChannel();
        port.close();
        interrupt.abort();
        options?.abortSignal?.removeEventListener('abort', abortProxy);
    }

    onUnlock('supportChannel'+channelId, interrupt.signal).then(() => {
        const error = new MessageEvent(EventType.Error, { data: new Error('Lose Channel') });
        errorHandlers.forEach(handler => handler(error));
        close();
    }).catch(noop);

    return {
        postMessage: port.postMessage.bind(port),
        dispatchEvent: port.dispatchEvent.bind(port),
        addEventListener,
        removeEventListener,
        close
    };
};
