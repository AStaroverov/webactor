import type { AnyEnvelope } from 'webactor';
import { createActor, createDenseNetwork, supportChannel, useContextMessagePort } from 'webactor';

const host = createActor('channel-host', (context) => {
    const listener = (envelope: AnyEnvelope) => {
        if (envelope.data !== 'open-probe-channel') return;
        void supportChannel(context, envelope)
            .then((channel) => {
                channel.addEventListener('message', (reply: AnyEnvelope) => {
                    channel.postMessage({ echo: reply.data });
                });
            })
            .catch(() => {});
    };

    context.addEventListener('message', listener);
    return () => context.removeEventListener('message', listener);
});

createDenseNetwork(useContextMessagePort(), host).launch();
