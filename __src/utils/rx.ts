import { Observable } from 'rxjs';
import { subscribe } from '../pubsub/subscribe';
import { AnyEnvelope, DataEvent, EnvelopeSubscribeSource, MessagePortLike } from '../types';
import { ensureEventListenerLike, ensureMessagePortLike, ensureServiceWorkerGlobalScope } from './ensure';

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
    ensureEventListenerLike(context);
    return fromMessagePortLike<T, ExtendableMessageEvent>(context);
}

export function fromMessagePortLike<T extends AnyEnvelope, E extends DataEvent>(
    port: EnvelopeSubscribeSource<T, E>,
): Observable<WithEvent<T, E>> {
    return new Observable((subscriber) => {
        return subscribe(port, (_envelope, event) => {
            const envelope = _envelope as WithEvent<T, E>;
            envelope.event = event;
            subscriber.next(envelope);
        });
    });
}
