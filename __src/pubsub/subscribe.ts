import { createEnvelope, isEnvelope } from '../envelope';
import { loggerProvider } from '../providers';
import {
    AnyEnvelope,
    DataEvent,
    EnvelopeSubscribeSource,
    Subscribe,
    SubscribeCallback
} from '../types';
import { isEventListenerLike, isPostMessageLike } from '../utils/detect';
import { ACK_TYPE } from './defs';

export function subscribe<T extends AnyEnvelope, E extends void | DataEvent>(
    source: EnvelopeSubscribeSource<T, E>,
    callback: SubscribeCallback<T, E>,
): VoidFunction {
    return createSubscribe(source)(callback);
}

export function createSubscribe<T extends AnyEnvelope, E extends void | DataEvent>(
    source: EnvelopeSubscribeSource<T, E>,
): Subscribe<T, E> {
    return function subscribe(callback): VoidFunction {
        if (typeof source === 'object' && 'subscribe' in source) {
            return source.subscribe(callback as SubscribeCallback<T, void>);
        }

        if (isEventListenerLike(source)) {
            const postMessageWrapper = createPostMessageWrapper(source, callback as SubscribeCallback<T, DataEvent>);

            source.start?.();
            source.addEventListener('message', postMessageWrapper);

            return () => source.removeEventListener('message', postMessageWrapper);
        }

        throw new Error('Invalid subscribe source');
    };
}

function createPostMessageWrapper<T extends AnyEnvelope, E extends DataEvent>(
    source: unknown,
    callback: SubscribeCallback<T, E>,
) {
    return (event: E) => {
        console.log(`>> Received event:`, event);

        const envelope = event.data as T;

        if (!isEnvelope(envelope)) return;

        callback(envelope, event);

        if (envelope.type === ACK_TYPE) return;
        if (isPostMessageLike(source)) {
            source.postMessage(createEnvelope(ACK_TYPE, envelope.uniqueId));
        } else if (event instanceof ExtendableMessageEvent) {
            const source = event.source;

            if (isPostMessageLike(source)) {
                source.postMessage(createEnvelope(ACK_TYPE, envelope.uniqueId));
            } else {
                loggerProvider.warn('Cannot send ack to', source);
            }
        }
    };
}
