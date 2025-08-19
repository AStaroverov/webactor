import { intervalProvider } from '../providers';
import type {
    Message,
    MessagePortLike
} from '../types';
import { createEventId } from '../utils/common';
import { Defer } from '../utils/Defer';

export async function request<Out extends Message, In extends Message>(
    target: MessagePortLike<In & Out>,
    message: Out,
    options?: {
        id?: string
        retryDelay?: number;
        abortSignal?: AbortSignal
    }
): Promise<MessageEvent<In>> {
    const id = options?.id ?? createEventId();
    const event = new MessageEvent('message', { data: message, origin: id, lastEventId: id });
    const defer = new Defer<MessageEvent<In>>(options?.abortSignal);
    const retryIntervalId = intervalProvider.setInterval(
        () => target.dispatchEvent(event),
        options?.retryDelay ?? 500
    );
    const onResponse = (event: MessageEvent<In>) => {
        defer.resolve(event);
    };
    const onError = (event: MessageEvent<Error>) => {
        const error = event.data as Error & { originalEvent?: MessageEvent<Error> };
        error.originalEvent = event;
        defer.reject(error);
    };

    target.addEventListener('error', onError);
    target.addEventListener('message', onResponse);
    target.addEventListener('messageerror', onError);
    target.dispatchEvent(event);
    
    defer.promise.finally(() => {
        intervalProvider.clearInterval(retryIntervalId);
        target.removeEventListener('error', onError);
        target.removeEventListener('message', onResponse);
        target.removeEventListener('messageerror', onError);
    });

    return defer.promise;
};
