import { AnyEnvelope, EnvelopeType, isEnvelope, shallowCopyEnvelope } from './envelope';
import { AnyData, EventType, Transmitter } from './types';
import { createRoute, extendRoute, isRoutedEnvelope, reduceRoute, routeEndsWith } from './utils/route';
import { getTransmitterName, on, post } from './utils/transmitter';

type Type = (typeof EventType.Message | typeof EnvelopeType.Message | typeof EnvelopeType.Close | typeof EnvelopeType.Error);

export function connectTransmitters<T1 extends Transmitter, T2 extends Transmitter>(
    transmitter1: T1,
    transmitter2: T2,
    types: Type[] = [EnvelopeType.Message]
): VoidFunction {
    const unsub1 = resubscribe(transmitter1, transmitter2, types);
    const unsub2 = resubscribe(transmitter2, transmitter1, types);

    return () => {
        unsub1();
        unsub2();
    };
}

function resubscribe(
    source: Transmitter,
    target: Transmitter,
    types: Type[]
) {
    const disposes = types.map(type => on(source, type, createReposter(type, source, target)));
    return () => disposes.forEach(off => off());
}

function createReposter(type: Type, source: Transmitter, target: Transmitter) {
    const sourceName = getTransmitterName(source);
    const targetName = getTransmitterName(target);
    return function repost(data: AnyData) {
        if (isEnvelope(data)) {
            const envelope = processEnvelope(data, sourceName, targetName);
            if (envelope) post(target, type, envelope);
        } else {
            post(target, type, data);
        }
    };
}

function processEnvelope(envelope: AnyEnvelope, sourceName: string, targetName: string) {
    const copy = shallowCopyEnvelope(envelope);
    copy.__checkpoints = extendRoute(copy.__checkpoints ?? createRoute(), sourceName, targetName);

    if (isRoutedEnvelope(copy)) {
        if (!routeEndsWith(copy.__route, targetName, sourceName)) return undefined; // Stop if route doesn't match
        copy.__route = reduceRoute(copy.__route, targetName, sourceName);
    }

    return copy;
}