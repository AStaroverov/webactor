import { DataEvent, EventListenerLike, MessagePortLike } from '../types';
import { isEventListenerLike, isMessagePortLike, isServiceWorkerGlobalScope } from './detect';

export function ensureMessagePortLike(port: unknown): asserts port is MessagePortLike {
    if (!isMessagePortLike(port)) {
        throw new Error('Is not message port like');
    }
}

export function ensureEventListenerLike(port: unknown): asserts port is EventListenerLike<DataEvent> {
    if (!isEventListenerLike(port)) {
        throw new Error('Is not event listener like');
    }
}

export function ensureServiceWorkerGlobalScope(scope: unknown): asserts scope is ServiceWorkerGlobalScope {
    if (!isServiceWorkerGlobalScope(scope)) {
        throw new Error('Is not service worker global scope');
    }
}
