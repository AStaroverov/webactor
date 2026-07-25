import type { AnyEnvelope } from 'webactor';
import { createActor, createDenseNetwork, response, useContextMessagePort } from 'webactor';

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

const api = createActor('api', (context) => {
    let sequence = 0;

    const listener = (envelope: AnyEnvelope) => {
        const data = envelope.data as { type?: string; query?: string; page?: number } | null;
        if (data === null || typeof data !== 'object') return;

        switch (data.type) {
            case 'auth':
                setTimeout(
                    () => response(context, envelope, { user: 'you', token: `t-${++sequence}` }),
                    latency(80, 200),
                );
                break;
            case 'conversations':
                setTimeout(
                    () =>
                        response(
                            context,
                            envelope,
                            PEERS.map((peer, index) => ({ id: index, peer, unread: index % 2 })),
                        ),
                    latency(90, 260),
                );
                break;
            case 'search':
                setTimeout(
                    () =>
                        response(context, envelope, {
                            query: data.query,
                            hits: REPLIES.filter((reply) => reply.includes((data.query ?? '').slice(0, 2))).slice(0, 3),
                        }),
                    latency(120, 320),
                );
                break;
            case 'history':
                setTimeout(
                    () =>
                        response(context, envelope, {
                            page: data.page,
                            messages: REPLIES.slice(0, 4).map((text, index) => ({ id: index, text })),
                        }),
                    latency(150, 400),
                );
                break;
            case 'send-message':
                setTimeout(() => response(context, envelope, { delivered: true, id: ++sequence }), latency(60, 180));
                break;
        }
    };

    context.addEventListener('message', listener);
    return () => context.removeEventListener('message', listener);
});

createDenseNetwork(useContextMessagePort(), api).launch();
