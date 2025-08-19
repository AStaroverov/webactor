import type { Message, MessagePortLike } from '../types';
import { createEventId } from '../utils/common';

export function response<T extends Message | MessagePort>(
    target: MessagePortLike<Message>,
    requestEvent: MessageEvent<Message>,
    response: T,
) {
    const event = new MessageEvent('message', {
        data: response,
        origin: requestEvent.origin,
        lastEventId: createEventId(),
        source: response instanceof MessagePort ? response : undefined,
    });
    target.dispatchEvent(event);
}
