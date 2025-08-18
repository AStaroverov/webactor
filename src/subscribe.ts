import { isEnvelope } from './envelope';
import { isSystemEnvelope } from './isSystemEnvelope';
import { AnyEnvelope, EnvelopeSource, EventSubscribe, SubscribeCallback, SystemEnvelope } from './types';
import { isEventListenerLike } from './worker/detect';

function createWrapper<T extends AnyEnvelope>(callback: SubscribeCallback<T>, withSystemEnvelopes?: void | boolean) {
    return withSystemEnvelopes === true ? callback : (envelope: T) => !isSystemEnvelope(envelope) && callback(envelope);
}

function createPostMessageWrapper<T extends AnyEnvelope>(callback: SubscribeCallback<T>) {
    return (event: MessageEvent) => {
        if (isEnvelope(event.data)) {
            callback(event.data as T);
        }
    };
}

export function createSubscribe<T extends AnyEnvelope>(source: EnvelopeSource<T>): EventSubscribe<T> {
    return function subscribe(type: 'message' | 'messageerror', callback, withSystemEnvelopes) {
        const wrapper = createWrapper(callback, withSystemEnvelopes);

        if (isEventListenerLike(source)) {
            const postMessageWrapper = createPostMessageWrapper(wrapper);

            source.start?.();
            source.addEventListener(type, postMessageWrapper);

            return () => source.removeEventListener(type, postMessageWrapper);
        }

        throw new Error('Invalid subscribe source');
    };
}

export function subscribe<T extends AnyEnvelope, F extends false | true | void = false>(
    source: EnvelopeSource<T>,
    callback: SubscribeCallback<F extends true ? T | SystemEnvelope : T>,
    withSystemEnvelopes?: F,
): Function {
    return createSubscribe(source)(callback, withSystemEnvelopes);
}
