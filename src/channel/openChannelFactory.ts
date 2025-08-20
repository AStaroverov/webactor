import { request } from '../request/request';
import { EventType, EventTypes, Message, MessagePortLike } from '../types';
import { createEventId, noop } from '../utils/common';
import { lock, onUnlock } from '../utils/Locks';
import { isMessagePortLike } from '../worker/detect';
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
    const abortProxy = () => {
        debugger
        interrupt.abort(options?.abortSignal?.reason)
    };
    options?.abortSignal?.addEventListener('abort', abortProxy, { once: true });
    
    const channelId = createEventId();
    const unlockChannel = await lock('openChannel'+channelId);
    const event = await request<T>(
        target,
        message,
        { id: channelId, abortSignal: interrupt.signal }
    );

    if (!isMessagePortLike(event.data)) {
        throw new Error('Invalid handshake response');
    }

    const port = event.data as MessagePortLike<Message>;

    port.start?.();
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
        port.close?.();
        interrupt.abort();
        options?.abortSignal?.removeEventListener('abort', abortProxy);
        unlockChannel();
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
