import { AnyData, EventListenerLike, Message, PostLike } from "../types";

export const isWindowScope = (context: unknown): context is Window =>
    typeof Window !== 'undefined' && context instanceof Window;
export const isSharedWorkerScope = (context: unknown): context is SharedWorkerGlobalScope =>
    typeof SharedWorkerGlobalScope !== 'undefined' && context instanceof SharedWorkerGlobalScope;
export const isDedicatedWorkerScope = (context: unknown): context is DedicatedWorkerGlobalScope =>
    typeof DedicatedWorkerGlobalScope !== 'undefined' && context instanceof DedicatedWorkerGlobalScope;

export const isPostMessageLike = <T extends Message>(context: unknown): context is PostLike<T> => {
    return typeof context === 'object' && context !== null
        && 'postMessage' in context
        && typeof (context as PostLike<T>).postMessage === 'function';
}

export const isEventListenerLike = <T extends Message>(context: unknown): context is EventListenerLike<AnyData> => {
    return typeof context === 'object' && context !== null
        && 'addEventListener' in context
        && typeof (context as EventListenerLike<T>).addEventListener === 'function'
        && 'removeEventListener' in context
        && typeof (context as EventListenerLike<T>).removeEventListener === 'function';
}

export const isMessagePortLike = <T extends Message>(context: unknown): context is PostLike<T> & EventListenerLike<T> => {
    return isPostMessageLike<T>(context) && isEventListenerLike<T>(context);
}

export const isErrorLike = (v: unknown): v is Error | ErrorEvent => {
    if (v instanceof Error) return true;
    if (globalThis.ErrorEvent && v instanceof globalThis.ErrorEvent) return true;
    return false;
}