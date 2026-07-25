import { createActor, createDenseNetwork, useContextMessagePort } from 'webactor';
import { onActorMessage } from '../harness';

const consumer = createActor('flood-consumer', (context) => {
    let received = 0;
    return onActorMessage(context, (data) => {
        const message = data as { type: string };
        if (message.type === 'flood') {
            received += 1;
        } else if (message.type === 'report') {
            context.postMessage({ type: 'stats', received });
        }
    });
});

createDenseNetwork(useContextMessagePort(), consumer).launch();
