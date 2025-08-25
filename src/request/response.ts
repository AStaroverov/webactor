import { post } from '../dispatch';
import { createEnvelope, Envelope } from '../envelope';
import { AnyData, EventType, type EnvelopeMessagePort, type Message } from '../types';

export function response(
    target: EnvelopeMessagePort,
    request: Envelope<Message>,
    response: Message | MessagePort,
) {
    if (request.channelId == null) throw new Error('Missing channelId');

    const envelope = createEnvelope(EventType.Message, response as AnyData, {
        channelId: request.channelId,
        transferable: response instanceof MessagePort ? [response] : undefined,
    });

    post(target, envelope.type, envelope);
}
