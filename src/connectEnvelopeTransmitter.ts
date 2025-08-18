import { shallowCopyEnvelope } from './envelope';
import { extendRoute, reduceRoute, routeEndsWith } from './route';
import type { AnyEnvelope, EnvelopeTransmitter } from './types';
import { getTransmitterName } from './utils/common';

const NAME = 'TransmitterRetranslatorError';
class TransmitterRetranslatorError extends Error {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = NAME;
    }
}

export function connectEnvelopeTransmitter<T1 extends EnvelopeTransmitter, T2 extends EnvelopeTransmitter>(
    transmitter1: T1,
    transmitter2: T2,
): Function {
    const unsub1 = resubscribe(transmitter1, transmitter2);
    const unsub2 = resubscribe(transmitter2, transmitter1);

    return () => {
        unsub1();
        unsub2();
    };
}

function resubscribe(
    source: EnvelopeTransmitter,
    target: EnvelopeTransmitter,
) {
    const sourceName = getTransmitterName(source);
    const targetName = getTransmitterName(target);
    const onMessage = createReposter(sourceName, targetName, target);
    const onError = (event: MessageEvent<Error>) => {
        const proxyEvent = event.data.name === NAME
            ? event
            : new MessageEvent('messageerror', { data: new TransmitterRetranslatorError(
                `Retranslated error from ${sourceName} to ${targetName}`,
                { cause: event.data },
            )});

        target.dispatchEvent(proxyEvent);
    }
    
    source.start?.();
    source.addEventListener('message', onMessage);
    source.addEventListener('messageerror', onError);

    return () => {
        source.removeEventListener('message', onMessage);
        source.removeEventListener('messageerror', onError);
    };
}

function createReposter(
    sourceName: string,
    targetName: string,
    target: EnvelopeTransmitter,
) {
    return function repost(event: MessageEvent<AnyEnvelope>) {
        const envelope = event.data;
        if (envelope === undefined) return;

        const isCorrectRoute = hasCorrectRoute(envelope, targetName);

        if (!isCorrectRoute) return;

        const copy = shallowCopyEnvelope(envelope);

        copy.routePassed = extendPassedPart(copy, sourceName);
        copy.routeAnnounced = reduceAnnouncedPart(copy, targetName);

        try {
            target.postMessage(copy);
        } catch (err) {
            target.dispatchEvent(new MessageEvent('messageerror', { data: new TransmitterRetranslatorError(
                `Error while retranslating envelope from ${sourceName} to ${targetName}`,
                { cause: err },
            )}));
        }
    };
}

function hasCorrectRoute(envelope: AnyEnvelope, part: string) {
    return envelope.routeAnnounced === undefined || routeEndsWith(envelope.routeAnnounced, part);
}

function extendPassedPart(envelope: AnyEnvelope, part: string) {
    return extendRoute(envelope.routePassed ?? '', part);
}

function reduceAnnouncedPart(envelope: AnyEnvelope, part: string) {
    return envelope.routeAnnounced === undefined ? undefined : reduceRoute(envelope.routeAnnounced, part);
}
