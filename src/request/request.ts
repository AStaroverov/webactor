import { isEnvelope, shallowCopyEnvelope } from '../envelope';
import type {
    AnyEnvelope,
    EnvelopeTransmitter
} from '../types';
import { createShortRandomString } from '../utils/common';
import { Defer } from '../utils/Defer';

export function createRequestName(type: string) {
    return `Request(${type}[${createShortRandomString()}])`;
}

export function request<T extends AnyEnvelope>(
    target: EnvelopeTransmitter<T>,
    envelope: T,
    abortSignal?: AbortSignal
): Promise<T> {
    const defer = new Defer<T>(abortSignal);
    const seedRoute = envelope.routePassed ?? createRequestName(envelope.type);
    const isResponse = (envelope: AnyEnvelope): envelope is T => {
        return envelope.routeAnnounced === undefined ? false : envelope.routeAnnounced.startsWith(seedRoute);
    };        

    const onResponse = (event: MessageEvent<object>) => {
        if (isEnvelope(event.data) && isResponse(event.data)) {
            defer.resolve(event.data);
        }
    };
    const onError = (event: MessageEvent<Error>) => {
        defer.reject(event.data);
    };

    const unsubscribe = () => {
        target.removeEventListener('message', onResponse);
        target.removeEventListener('messageerror', onError);
    };
    target.addEventListener('message', onResponse);
    target.addEventListener('messageerror', onError);
    
    const copy = shallowCopyEnvelope(envelope);
    copy.routePassed = seedRoute;
    target.postMessage(copy);

    defer.promise.finally(() => {
        unsubscribe();
    });

    return defer.promise;
};
