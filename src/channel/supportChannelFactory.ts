import { response } from '../request/response';
import { EventType, EventTypes, Message, MessagePortLike } from '../types';
import { noop } from '../utils/common';
import { Defer } from '../utils/Defer';
import { lock, onUnlock } from '../utils/Locks';
import { HANDSHAKE } from './defs';
import type { ChannelTransmitter } from './types';

export async function supportChannel<T extends Message>(
    target: MessagePortLike<Message>,
    event: MessageEvent<Message>,
): Promise<ChannelTransmitter> {
    const abort = new AbortController();
    const messageChannel = new MessageChannel();
    response(target, event, messageChannel.port1);

    const unlockChannel = await lock('supportChannel'+event.origin);
    
    const defer = new Defer(abort.signal);
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
    const handshake = () => {
        messageChannel.port2.postMessage(HANDSHAKE);
        defer.resolve(channelTransmitter);
    }
    const close = () => {
        abort.abort();
        unlockChannel();
        messageChannel.port1.close();
        messageChannel.port2.close();
        messageChannel.port2.removeEventListener('message', handshake);
    }

    messageChannel.port2.addEventListener('message', handshake, { once: true });
    
    onUnlock('openChannel'+event.origin, abort.signal).then(() => {
        const error = new MessageEvent(EventType.Error, { data: new Error('Lose Channel') });
        errorHandlers.forEach(handler => handler(error));
        close();
    }).catch(noop);
    
    const channelTransmitter = {
        postMessage: messageChannel.port2.postMessage.bind(messageChannel.port2),
        dispatchEvent: messageChannel.port2.dispatchEvent.bind(messageChannel.port2),
        addEventListener,
        removeEventListener,
        close
    }

    return defer.promise;
};
