import { AnyEnvelope, Envelope } from './types';
import { threadId } from './utils/thread';
import { createShortRandomString } from './utils/common';

export function isEnvelope<T extends AnyEnvelope>(some: unknown): some is T {
    return typeof some === 'object' && some != null && 'type' in some && typeof some.type === 'string';
}

export function createEnvelope<T extends string, P>(
    type: T,
    payload: P,
    transferable?: undefined | Transferable[],
): Envelope<T, P> {
    const id = createShortRandomString();
    return {
        type,
        payload,
        transferable,
        uniqueId: id,
        threadId,
        // channelId: id,
    };
}

export function shallowCopyEnvelope<T extends AnyEnvelope>(envelope: T): T {
    return Object.assign({}, envelope);
}
