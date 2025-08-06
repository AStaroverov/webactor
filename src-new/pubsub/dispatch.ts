import {
    AnyEnvelope,
    DataEvent,
    DispatchOptions,
    EnvelopeDispatchTarget,
    Message,
    MessagePortLike,
    Nil,
} from '../types';
import { Err, ErrCode } from '../utils/Error';
import { subscribe } from './subscribe';
import { ACK_TYPE } from './defs';
import { first, map, mergeMap, Observable, of, throwError, timeout } from 'rxjs';
import { isEnvelope } from '../envelope';
import { isMessagePortLike } from '../utils/detect';

const dispatchOptionsDefault: DispatchOptions = {
    ackTimeout: 10_000,
    targetTimeout: 10_000,
};

export function dispatch<T extends EnvelopeDispatchTarget<Message>>(
    target: T | Observable<Nil | T>,
    envelope: AnyEnvelope,
    options = dispatchOptionsDefault,
): Observable<unknown> {
    return createDispatch(target)(envelope, options);
}

export function createDispatch<T extends EnvelopeDispatchTarget<Message>>(
    target: T | Observable<Nil | T>,
): <E extends AnyEnvelope>(envelope: E, options?: DispatchOptions) => Observable<unknown> {
    if (target instanceof Observable) {
        return createDeferredDispatch(target);
    }

    if (isMessagePortLike(target)) {
        return createPortDispatch(target);
    }

    if (typeof target === 'object' && 'dispatch' in target) {
        return (envelope) => of(target.dispatch(envelope));
    }

    throw new Error('Invalid dispatch target');
}

function createPortDispatch<T extends MessagePortLike<Message, DataEvent>>(port: T) {
    return function dispatchWithAck(envelope: AnyEnvelope, options = dispatchOptionsDefault): Observable<unknown> {
        const ackTimeout = timeout({
            first: options.ackTimeout,
            with: throwTimeoutError.bind(null, `Ack timeout. Ack enveloper not received from target.`),
        });

        return new Observable((subscriber) => {
            const unsub = subscribe(port, (message) => {
                if (isEnvelope(message) && message.type === ACK_TYPE && message.uniqueId === envelope.uniqueId) {
                    subscriber.next(undefined);
                }
            });
            port.postMessage(envelope, envelope.transferable);

            return unsub;
        }).pipe(first(), ackTimeout);
    };
}

function createDeferredDispatch<T extends EnvelopeDispatchTarget<Message>>(
    target$: Observable<Nil | T>,
): (envelope: AnyEnvelope) => Observable<unknown> {
    return function deferredDispatch(envelope: AnyEnvelope, options = dispatchOptionsDefault): Observable<unknown> {
        const targetTimeout = timeout({
            first: options.targetTimeout,
            with: throwTimeoutError.bind(null, `Target timeout. Target is not available.`),
        });

        return target$.pipe(
            first((v): v is T => v != null),
            map((target) => createDispatch(target)),
            mergeMap((dispatch) => dispatch(envelope, options)),
            targetTimeout,
        );
    };
}

function throwTimeoutError(message: string) {
    return throwError(() => new Err(ErrCode.Timeout, message));
}
