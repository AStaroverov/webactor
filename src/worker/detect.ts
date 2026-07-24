import { AnyData, EventListenerLike, Message, PostLike } from '../types';

const tryCheck = (fn: () => boolean) => {
    try {
        return fn();
    } catch (error) {
        return false;
    }
};

export const isWorker = (value: unknown): value is Worker => tryCheck(() => value instanceof Worker);
export const isSharedWorker = (value: unknown): value is SharedWorker => tryCheck(() => value instanceof SharedWorker);
export const isWorkerLike = (value: unknown): value is Worker | SharedWorker =>
    isWorker(value) || isSharedWorker(value);

export const isWindowScope = (context: unknown): context is Window => tryCheck(() => context instanceof Window);
export const isSharedWorkerScope = (context: unknown): context is SharedWorkerGlobalScope =>
    tryCheck(() => context instanceof SharedWorkerGlobalScope);
export const isDedicatedWorkerScope = (context: unknown): context is DedicatedWorkerGlobalScope =>
    tryCheck(() => context instanceof DedicatedWorkerGlobalScope);

export const isPostMessageLike = <T extends Message>(context: unknown): context is PostLike<T> => {
    return (
        typeof context === 'object' &&
        context !== null &&
        'postMessage' in context &&
        typeof (context as PostLike<T>).postMessage === 'function'
    );
};

export const isEventListenerLike = <T extends Message>(context: unknown): context is EventListenerLike<AnyData> => {
    return (
        typeof context === 'object' &&
        context !== null &&
        'addEventListener' in context &&
        typeof (context as EventListenerLike<T>).addEventListener === 'function' &&
        'removeEventListener' in context &&
        typeof (context as EventListenerLike<T>).removeEventListener === 'function'
    );
};

export const isMessagePortLike = <T extends Message>(
    context: unknown,
): context is PostLike<T> & EventListenerLike<T> => {
    return isPostMessageLike<T>(context) && isEventListenerLike<T>(context);
};
