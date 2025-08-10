import { createDispatch } from './dispatch';
import { shallowCopyEnvelope } from './envelope';
import { loggerProvider } from './providers';
import { extendRoute, reduceRoute, routeEndsWith } from './route';
import { subscribe } from './subscribe';
import type { AnyEnvelope, Envelope, EnvelopeTransmitter } from './types';
import { getTransmitterName } from './utils/common';

export function connectEnvelopeTransmitter<T1 extends EnvelopeTransmitter, T2 extends EnvelopeTransmitter>(
    transmitter1: T1,
    transmitter2: T2,
): Function {
    const name1 = getTransmitterName(transmitter1);
    const name2 = getTransmitterName(transmitter2);
    const unsub1 = subscribe(transmitter1, createRedispatch(name1, name2, transmitter2), true);
    const unsub2 = subscribe(transmitter2, createRedispatch(name2, name1, transmitter1), true);

    return () => {
        unsub1();
        unsub2();
    };
}

function createRedispatch(
    sourceName: string,
    targetName: string,
    target: EnvelopeTransmitter,
) {
    const dispatch = createDispatch(target);
    return function redispatch(envelope: Envelope<any, any>) {
        if (envelope === undefined) return;

        const isCorrectRoute = hasCorrectRoute(envelope, targetName);

        if (!isCorrectRoute) return;

        const copy = shallowCopyEnvelope(envelope);

        copy.routePassed = extendPassedPart(copy, sourceName);
        copy.routeAnnounced = reduceAnnouncedPart(copy, targetName);

        try {
            dispatch(copy);
        } catch (err) {
            loggerProvider.error(err);
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
