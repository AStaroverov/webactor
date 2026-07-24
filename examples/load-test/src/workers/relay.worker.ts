import { createActor, createDenseNetwork, useContextMessagePort } from 'webactor';
import { onActorMessage } from '../harness';

const relay = createActor('relay', (context) => {
    let index = -1;
    return onActorMessage(context, (data) => {
        const message = data as { type: string; index?: number; hop?: number };
        if (message.type === 'init') {
            index = message.index!;
        } else if (message.type === 'chain' && message.hop === index) {
            context.postMessage({ ...message, hop: index + 1 });
        }
    });
});

createDenseNetwork(useContextMessagePort(), relay).launch();
