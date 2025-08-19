import { CHANNEL_CLOSE_TYPE, CHANNEL_READY_TYPE, HANDSHAKE_PREFIX } from './channel/defs';
import type { AnyEnvelope, SystemEnvelope } from './types';
import { CONNECT_THREAD_TYPE, DISCONNECT_THREAD_TYPE } from './worker/defs';

export function isSystemEnvelope(envelope: AnyEnvelope): envelope is SystemEnvelope {
    return (
        envelope.type === CONNECT_THREAD_TYPE ||
        envelope.type === DISCONNECT_THREAD_TYPE ||
        envelope.type === HANDSHAKE_PREFIX ||
        envelope.type === CHANNEL_READY_TYPE ||
        envelope.type === CHANNEL_CLOSE_TYPE
    );
}
