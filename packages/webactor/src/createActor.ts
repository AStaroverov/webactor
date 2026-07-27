import { createActorFactory } from './createActorFactory';
import { createEnvelopeChannel } from './createEnvelopePort';

export const createActor = createActorFactory({
    createChannel: createEnvelopeChannel,
});
