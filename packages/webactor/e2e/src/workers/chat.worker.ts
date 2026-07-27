import type { AnyEnvelope } from 'webactor';
import { createActor, createDenseNetwork, supportChannel, useContextMessagePort } from 'webactor';

const OPEN_CONVERSATION = 'open-conversation';

const PEERS = ['ada', 'grace', 'linus', 'margaret'];
const REPLIES = [
    'sounds good',
    'let me check the logs',
    'shipping it now',
    'can you rebase?',
    'nice, that explains the leak',
    'meeting in 10?',
];

const latency = (from: number, to: number) => from + Math.random() * (to - from);

const chatHub = createActor('chat-hub', (context) => {
    const sessions: { stop: () => void; close: () => void }[] = [];

    const listener = (envelope: AnyEnvelope) => {
        if (envelope.data !== OPEN_CONVERSATION) return;

        void supportChannel(context, envelope)
            .then((channel) => {
                let turn = 0;
                const tick = setInterval(
                    () =>
                        channel.postMessage({
                            from: PEERS[Math.floor(Math.random() * PEERS.length)],
                            text: REPLIES[turn++ % REPLIES.length],
                            at: Date.now(),
                        }),
                    latency(2200, 4800),
                );

                channel.addEventListener('message', () => {
                    setTimeout(() => channel.postMessage({ receipt: 'read', at: Date.now() }), latency(300, 900));
                });

                sessions.push({ stop: () => clearInterval(tick), close: () => channel.close() });
            })
            .catch(() => {});
    };

    context.addEventListener('message', listener);
    return () => {
        context.removeEventListener('message', listener);
        for (const session of sessions) {
            session.stop();
            session.close();
        }
    };
});

createDenseNetwork(useContextMessagePort(), chatHub).launch();
