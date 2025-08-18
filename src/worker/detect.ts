import { EventListenerLike, EventPostLike, Message } from "../types";

export const isWindowScope = (context: unknown): context is Window =>
    typeof Window !== 'undefined' && context instanceof Window;
export const isSharedWorkerScope = (context: unknown): context is SharedWorkerGlobalScope =>
    typeof SharedWorkerGlobalScope !== 'undefined' && context instanceof SharedWorkerGlobalScope;
export const isDedicatedWorkerScope = (context: unknown): context is DedicatedWorkerGlobalScope =>
    typeof DedicatedWorkerGlobalScope !== 'undefined' && context instanceof DedicatedWorkerGlobalScope;

export const isPostMessageLike = <T extends Message>(context: unknown): context is EventPostLike<T> => {
    return typeof context === 'object' && context !== null
        && 'postMessage' in context
        && typeof (context as EventPostLike<T>).postMessage === 'function';
}

export const isEventListenerLike = <T extends Message, E extends Error = Error>(context: unknown): context is EventListenerLike<T, E> => {
    return typeof context === 'object' && context !== null
        && 'addEventListener' in context
        && typeof (context as EventListenerLike<T, E>).addEventListener === 'function'
        && 'removeEventListener' in context
        && typeof (context as EventListenerLike<T, E>).removeEventListener === 'function';
}

export const isMessagePortLike = <T extends Message, E extends Error = Error>(context: unknown): context is EventPostLike<T> & EventListenerLike<T, E> => {
    return isPostMessageLike<T>(context) && isEventListenerLike<T, E>(context);
}