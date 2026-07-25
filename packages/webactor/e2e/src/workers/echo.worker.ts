import { createActor, createDenseNetwork, useContextMessagePort } from 'webactor';
import { onActorMessage } from '../harness';

const echo = createActor('worker-echo', (context) => {
    return onActorMessage(context, (data) => context.postMessage(data));
});

createDenseNetwork(useContextMessagePort(), echo).launch();
