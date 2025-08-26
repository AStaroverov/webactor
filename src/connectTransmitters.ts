import { AnyEnvelope, isEnvelope, shallowCopyEnvelope } from './envelope';
import { AnyData, ErrorEventTypes, EventTypes, Transmitter } from './types';
import { createRoute, extendRoute, reduceRoute, routeEndsWith } from './utils/route';
import { getTransmitterName, listen, post } from './utils/transmitter';

export function connectTransmitters<T1 extends Transmitter, T2 extends Transmitter>(
    transmitter1: T1,
    transmitter2: T2,
): VoidFunction {
    const unsub1 = resubscribe(transmitter1, transmitter2);
    const unsub2 = resubscribe(transmitter2, transmitter1);

    return () => {
        unsub1();
        unsub2();
    };
}

function resubscribe(
    source: Transmitter,
    target: Transmitter,
) {
    const onError = (type: ErrorEventTypes, err: ErrorEvent | Error) => post(target, type, err);
    const onMessage = createReposter(source, target);
    return listen(source, onError, onMessage);
}

function createReposter(source: Transmitter, target: Transmitter) {
    const sourceName = getTransmitterName(source);
    const targetName = getTransmitterName(target);
    return function repost(type: EventTypes, data: AnyData) {
        if (isEnvelope(data)) {
            const envelope = processEnvelope(data, sourceName, targetName);
            envelope && post(target, type, envelope);
        } else {
            post(target, type, data);
        }
    };
}

function processEnvelope(envelope: AnyEnvelope, sourceName: string, targetName: string) {
    const copy = shallowCopyEnvelope(envelope);
    copy.__checkpoints = extendRoute(copy.__checkpoints ?? createRoute(), sourceName);

    if (copy.__route !== undefined) {
        if (!routeEndsWith(copy.__route, targetName)) return undefined; // Stop if route doesn't match
        copy.__route = reduceRoute(copy.__route, targetName);
    }

    return copy;
}