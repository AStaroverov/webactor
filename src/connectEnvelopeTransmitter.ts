import { EventType, Message, MessagePortLike } from './types';
import { createEventId } from './utils/common';

const NAME = 'RetranslatorError';
class RetranslatorError extends Error {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = NAME;
    }
}

export function connectEnvelopeTransmitter<T1 extends MessagePortLike<Message>, T2 extends MessagePortLike<Message>>(
    transmitter1: T1,
    transmitter2: T2,
): VoidFunction {
    const unsub1 = resubscribe(transmitter1, transmitter2);
    const unsub2 = resubscribe(transmitter2, transmitter1);

    return () => {
        unsub1();
        unsub2();
    };
}

function resubscribe(
    source: MessagePortLike<Message>,
    target: MessagePortLike<Message>,
) {
    const onMessage = createReposter(source, target);
    const onError = (event: MessageEvent<Error>) => {
        target.dispatchEvent(event);
    }
    
    source.start?.();
    source.addEventListener(EventType.Error, onError);
    source.addEventListener(EventType.Message, onMessage);
    source.addEventListener(EventType.MessageError, onError);

    return () => {
        source.removeEventListener(EventType.Error, onError);
        source.removeEventListener(EventType.Message, onMessage);
        source.removeEventListener(EventType.MessageError, onError);
    };
}

function createReposter(source: MessagePortLike<Message>, target: MessagePortLike<Message>) {
    const map = new WeakMap<MessagePortLike<Message>, Set<string>>();
    const addMessageId = (port: MessagePortLike<Message>, id: string) => {
        if (!map.has(port)) {
            map.set(port, new Set());
        }
        map.get(port)!.add(id);
    };
    const hasMessageId = (port: MessagePortLike<Message>, id: string) => {
        return map.has(port) && map.get(port)!.has(id);
    };

    return function repost(event: MessageEvent<Message>) {
        const isResponse = event.type === 'message' && hasMessageId(source, event.origin);
        const copyEvent = target instanceof MessagePort && !isResponse
            ? new MessageEvent(event.type, {
                data: event.data,
                origin: event.origin,
                lastEventId: createEventId(),
            })
            : event;
        target.dispatchEvent(copyEvent);
        event.origin && addMessageId(target, event.origin);
    };
}
