import { devtools, handleBridgeEnvelope, isBridgeEnvelope, observeRemoteTransmitter } from './devtools/internal';
import { AnyEnvelope, createEnvelope, EnvelopeType, EnvelopeTypes, isEnvelope, shallowCopyEnvelope } from './envelope';
import { loggerProvider } from './providers';
import { Reasons } from './reason';
import { AnyData, EventType, Transmitter } from './types';
import { reasonToError } from './utils/common';
import {
    createRoute,
    extendRoute,
    isCheckpointedEnvelope,
    isRoutedEnvelope,
    reduceRoute,
    routeEndsWith,
} from './utils/route';
import { getTransmitterName, on, post } from './utils/transmitter';

type Type =
    | typeof EventType.Message
    | typeof EnvelopeType.Message
    | typeof EnvelopeType.Close
    | typeof EnvelopeType.Error;

export function connectTransmitters<T1 extends Transmitter, T2 extends Transmitter>(
    transmitter1: T1,
    transmitter2: T2,
    types: Type[] = [EnvelopeType.Message],
): VoidFunction {
    const linkId = devtools.link(transmitter1, transmitter2, types);
    observeRemoteTransmitter(transmitter1);
    observeRemoteTransmitter(transmitter2);

    const unsub1 = resubscribe(transmitter1, transmitter2, types);
    const unsub2 = resubscribe(transmitter2, transmitter1, types);

    return () => {
        unsub1();
        unsub2();
        devtools.unlink(linkId);
    };
}

function resubscribe(source: Transmitter, target: Transmitter, connectedTypes: Type[]) {
    const disposes = connectedTypes.map((subscribedType) =>
        on(source, subscribedType, createReposter(subscribedType, connectedTypes, source, target)),
    );
    disposes.push(on(source, EnvelopeType.MessageError, createMessageErrorReposter(source, target)));
    return () => disposes.forEach((off) => off());
}

function createMessageErrorReposter(source: Transmitter, target: Transmitter) {
    const sourceName = getTransmitterName(source);
    const targetName = getTransmitterName(target);
    return function repostMessageError(data: AnyData) {
        if (!isEnvelope(data)) {
            const report = createEnvelope(EnvelopeType.MessageError, reasonToError(data, Reasons.Undeserializable));
            safePost(source, target, EnvelopeType.MessageError, report);
            return;
        }
        if (!isRoutedEnvelope(data)) return; // addressed to this endpoint and already there, nothing to relay
        const envelope = processEnvelope(data, sourceName, targetName);
        if (envelope) safePost(source, target, envelope.type, envelope);
    };
}

function createReposter(subscribedType: Type, connectedTypes: Type[], source: Transmitter, target: Transmitter) {
    const sourceName = getTransmitterName(source);
    const targetName = getTransmitterName(target);
    return function repost(data: AnyData) {
        if (isEnvelope(data)) {
            if (!connectedTypes.includes(data.type as Type)) {
                if (isBridgeEnvelope(data)) handleBridgeEnvelope(source, data);
                return;
            }
            const envelope = processEnvelope(data, sourceName, targetName);
            if (envelope) safePost(source, target, envelope.type, envelope);
        } else {
            safePost(source, target, subscribedType, createEnvelope(subscribedType, data));
        }
    };
}

/** An envelope the router did not address to this link never happened here, so only real hops are recorded. */
function safePost(source: Transmitter, target: Transmitter, type: EnvelopeTypes, envelope: AnyEnvelope): void {
    try {
        post(target, type, envelope);
        devtools.message(source, target, envelope, true);
    } catch (error) {
        devtools.message(source, target, envelope, false);
        reportUndelivered(source, target, type, envelope, error);
    }
}

function reportUndelivered(
    source: Transmitter,
    target: Transmitter,
    type: EnvelopeTypes,
    failed: AnyEnvelope,
    error: unknown,
): void {
    if (type === EnvelopeType.MessageError) {
        loggerProvider.error(error);
        return;
    }

    const failure = reasonToError(error, Reasons.Undeliverable);

    // A routed envelope has someone waiting beyond the target, so the report keeps going that way
    if (isRoutedEnvelope(failed)) {
        const report = createEnvelope(EnvelopeType.MessageError, failure, undefined, { route: failed.__route });
        safePost(source, target, EnvelopeType.MessageError, report);
        return;
    }

    // Anyone waiting sits behind the source, and the checkpoints minus this hop are the way back to them
    const route = isCheckpointedEnvelope(failed)
        ? reduceRoute(failed.__checkpoints, getTransmitterName(source), getTransmitterName(target))
        : undefined;
    const report = createEnvelope(EnvelopeType.MessageError, failure, undefined, { route });

    try {
        post(source, EnvelopeType.MessageError, report);
    } catch (reportError) {
        loggerProvider.error(reportError);
    }
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
