import { createEnvelope } from '../envelope';

export const ACK_TYPE = 'ACK';

export function createAckEnvelope(id: string) {
    return createEnvelope(ACK_TYPE, { id });
}
