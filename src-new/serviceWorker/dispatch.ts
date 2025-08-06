import { ClientId } from './defs';
import { fromPromise } from 'rxjs/internal/observable/innerFrom';
import { ensureServiceWorkerGlobalScope } from '../utils/ensure';
import { first, map, mergeMap, Observable, throwError, timeout } from 'rxjs';
import { createDispatch } from '../pubsub/dispatch';
import { AnyEnvelope, DataEvent, Message, MessagePortLike, ThreadId } from '../types';
import { getClientId$ } from './threadsRegistry/registry';
import { Err, ErrCode } from '../utils/Error';
import { settingsProvider } from '../providers';

export function createThreadDispatch(threadId: ThreadId): <T extends AnyEnvelope>(envelope: T) => Observable<unknown> {
    return createDispatch(messagePortFromThreadId(threadId));
}

export function createClientDispatch(clientId: ClientId): <T extends AnyEnvelope>(envelope: T) => Observable<unknown> {
    return createDispatch(messagePortByClientId(clientId));
}

function messagePortByClientId(clientId: ClientId): Observable<MessagePortLike<Message, DataEvent>> {
    const scope = globalThis as unknown;
    ensureServiceWorkerGlobalScope(scope);

    return fromPromise(scope.clients.get(clientId)).pipe(
        first((v): v is Client => v != null),
        map((client) => {
            return {
                postMessage: client.postMessage.bind(client),
                addEventListener: scope.addEventListener.bind(scope),
                removeEventListener: scope.removeEventListener.bind(scope),
            } as MessagePortLike<Message, DataEvent>;
        }),
        timeout({
            first: settingsProvider.defaultTimeout,
            with: throwTimeoutError.bind(null, clientId),
        }),
    );
}

function messagePortFromThreadId(threadId: ThreadId): Observable<MessagePortLike<Message, DataEvent>> {
    return getClientId$(threadId).pipe(mergeMap(messagePortByClientId));
}

function throwTimeoutError(message: unknown) {
    return throwError(() => new Err(ErrCode.Timeout, `Cannot receive client "${JSON.stringify(message)}"`));
}
