import { AnyEnvelope, Envelope } from './types';
import { threadId } from './utils/thread';
import { createShortRandomString } from './utils/common';
import { isEnvelope } from './envelope';

export function isErrorEnvelope<T extends AnyEnvelope>(some: unknown): some is T {
    return isEnvelope(some) && some.type === 'Error';
}

export function createErrorEnvelope<P extends string>(payload: P): Envelope<'Error', P> {
    const id = createShortRandomString();
    return {
        type: 'Error',
        payload,
        uniqueId: id,
        threadId,
        // channelId: id,
    };
}
