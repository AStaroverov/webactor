import { DataEvent, EventListenerLike, Message, MessagePortLike, PostMessageLike } from '../types';

export const isWindowScope = (context: unknown): context is Window =>
    typeof Window !== 'undefined' && context instanceof Window;
export const isSharedWorkerScope = (context: unknown): context is SharedWorkerGlobalScope =>
    typeof SharedWorkerGlobalScope !== 'undefined' && context instanceof SharedWorkerGlobalScope;
export const isDedicatedWorkerScope = (context: unknown): context is DedicatedWorkerGlobalScope =>
    typeof DedicatedWorkerGlobalScope !== 'undefined' && context instanceof DedicatedWorkerGlobalScope;
export const isServiceWorkerGlobalScope = (context: unknown): context is ServiceWorkerGlobalScope =>
    typeof ServiceWorkerGlobalScope !== 'undefined' && context instanceof ServiceWorkerGlobalScope;

export const isPostMessageLike = <T extends Message>(context: unknown): context is PostMessageLike<T> => {
    return typeof context === 'object' && context !== null && 'postMessage' in context;
};

export const isEventListenerLike = <T extends DataEvent>(context: unknown): context is EventListenerLike<T> => {
    return typeof context === 'object' && context !== null && 'addEventListener' in context;
};

export const isMessagePortLike = <T extends Message, E extends DataEvent>(
    context: unknown,
): context is MessagePortLike<T, E> => {
    return isPostMessageLike(context) && isEventListenerLike(context);
};
