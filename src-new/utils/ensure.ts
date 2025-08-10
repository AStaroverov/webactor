import { MessagePortLike } from '../types';
import { isMessagePortLike, isServiceWorkerGlobalScope } from './detect';

export function ensureMessagePortLike(port: unknown): asserts port is MessagePortLike {
    if (!isMessagePortLike(port)) {
        throw new Error('Is not message port like');
    }
}

export function ensureServiceWorkerGlobalScope(scope: unknown): asserts scope is ServiceWorkerGlobalScope {
    if (!isServiceWorkerGlobalScope(scope)) {
        throw new Error('Is not service worker global scope');
    }
}
