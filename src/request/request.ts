import { intervalProvider } from '../providers';
import type {
    Message,
    MessagePortLike
} from '../types';
import { createEventId } from '../utils/common';
import { reasonToError } from '../worker/error';

export async function request<In extends Message>(
    target: MessagePortLike<In & Message>,
    message: Message,
    options?: {
        id?: string
        retryDelay?: number;
        abortSignal?: AbortSignal
    }
): Promise<MessageEvent<In>> {
    return new Promise((resolve, reject) => {
        options?.abortSignal?.addEventListener('abort', () => {
            reject(reasonToError(options?.abortSignal?.reason, 'Request aborted'));
            onFinally();
        });

        const id = options?.id ?? createEventId();
        const event = new MessageEvent('message', { data: message, origin: id, lastEventId: id });
        const retryIntervalId = intervalProvider.setInterval(
            () => target.dispatchEvent(event),
            options?.retryDelay ?? 500
        );
        const onFinally = () => {
            intervalProvider.clearInterval(retryIntervalId);
            target.removeEventListener('error', onError);
            target.removeEventListener('message', onResponse);
            target.removeEventListener('messageerror', onError);
        }
        const onResponse = (event: MessageEvent<In>) => {
            resolve(event);
            onFinally();
        };
        const onError = (event: MessageEvent<Error>) => {
            const error = event.data as Error & { originalEvent?: MessageEvent<Error> };
            error.originalEvent = event;
            reject(error);
            onFinally();
        };

        target.addEventListener('error', onError);
        target.addEventListener('message', onResponse);
        target.addEventListener('messageerror', onError);
        target.dispatchEvent(event);
    });
};
