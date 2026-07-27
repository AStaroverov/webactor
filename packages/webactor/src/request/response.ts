import { createEnvelope, Envelope, isEnvelope } from '../envelope';
import { AnyData, EventType, type Message, type TransferableOptions, type Transmitter } from '../types';
import { getFirstRouteCheckpoint } from '../utils/route';
import { post } from '../utils/transmitter';

export function response(
    target: Transmitter,
    request: Envelope<Message>,
    response: AnyData,
    transferable?: TransferableOptions,
) {
    if (request.__checkpoints == null) throw new Error('Missing checkpoints');

    const envelope = isEnvelope(response) ? response : createEnvelope(EventType.Message, response, transferable);
    envelope.__route = request.__checkpoints;
    envelope.__checkpoints = getFirstRouteCheckpoint(request.__checkpoints);

    post(target, envelope.type, envelope);
}
