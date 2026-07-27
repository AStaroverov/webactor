import { createActor, createDenseNetwork, useContextMessagePort } from 'webactor';
import { onActorMessage } from '../harness';

const hub = createActor('broadcast-hub', (context) => {
    return onActorMessage(context, (data) => {
        const message = data as { type: string; tab: number; seq: number };
        if (message.type === 'msg') {
            context.postMessage({ type: 'echo', tab: message.tab, seq: message.seq });
        }
    });
});

createDenseNetwork(useContextMessagePort(), hub).launch();
