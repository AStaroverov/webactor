import { Observable } from 'rxjs';
import { subscribe } from '../pubsub/subscribe';
import { AnyEnvelope, DataEvent, MessagePortLike } from '../types';
import { ensureMessagePortLike, ensureServiceWorkerGlobalScope } from './ensure';

type WithEvent<T extends AnyEnvelope, E> = T & { event: E };

export function fromServiceWorker<T extends AnyEnvelope>(sw: ServiceWorker): Observable<WithEvent<T, MessageEvent>> {
    ensureMessagePortLike(sw);
    return fromMessagePortLike<T, MessageEvent>(sw as MessagePortLike<T, MessageEvent>);
}

export function fromServiceWorkerGlobalScope<T extends AnyEnvelope>(): Observable<
    WithEvent<T, ExtendableMessageEvent>
> {
    const context = globalThis as unknown;
    ensureServiceWorkerGlobalScope(context);
    ensureMessagePortLike(context.serviceWorker);
    return fromMessagePortLike<T, ExtendableMessageEvent>(
        context.serviceWorker as MessagePortLike<T, ExtendableMessageEvent>,
    );
}

export function fromMessagePortLike<T extends AnyEnvelope, E extends DataEvent, R = T & { event: E }>(
    port: MessagePortLike<T, E>,
): Observable<R> {
    return new Observable((subscriber) => {
        return subscribe(port, (envelope, event) => {
            // @ts-ignore
            envelope.event = event.source;
            subscriber.next(envelope as R);
        });
    });
}
