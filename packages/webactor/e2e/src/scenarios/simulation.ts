import type { ActorContext, AnyEnvelope, ChannelTransmitter } from 'webactor';
import {
    applyActorSupervisor,
    connectActors,
    connectActorToWorker,
    createActor,
    openChannel,
    request,
    response,
} from 'webactor';
import { createPRNG, onActorMessage, sleep } from '../harness';

export type SimulationStats = {
    running: boolean;
    uptimeMs: number;
    activity: string;
    chatsOpened: number;
    keystrokes: number;
    messagesSent: number;
    messagesReceived: number;
    searches: number;
    historyPages: number;
    uploads: number;
    uploadCrashes: number;
    analyticsEvents: number;
};

const OPEN_CONVERSATION = 'open-conversation';

const DRAFTS = [
    'looks like the leak is in the supervisor',
    'pushed a fix, can you take a look',
    'the graph finally shows every thread',
    'rebasing now, one sec',
    'lets ship it before lunch',
    'found it — route mismatch on close',
];
const QUERIES = ['leak', 'rebase', 'logs', 'ship', 'route'];

const counters = {
    chatsOpened: 0,
    keystrokes: 0,
    messagesSent: 0,
    messagesReceived: 0,
    searches: 0,
    historyPages: 0,
    uploads: 0,
    uploadCrashes: 0,
    analyticsEvents: 0,
};

let disposers: (() => void)[] = [];
let startedAt = 0;
let running = false;
let activity = 'idle';

export function startSimulation(): SimulationStats {
    if (running) return simulationStats();

    running = true;
    startedAt = performance.now();
    activity = 'booting';
    for (const key of Object.keys(counters) as (keyof typeof counters)[]) counters[key] = 0;

    const random = createPRNG(0xc0ffee);
    const abort = new AbortController();
    const between = (from: number, to: number) => from + random() * (to - from);
    const pick = <T>(items: T[]): T => items[Math.floor(random() * items.length)];

    let shellContext: ActorContext | undefined;
    const shell = createActor('app-shell', (context: ActorContext) => {
        shellContext = context;
        return onActorMessage(context, () => {});
    });

    const session = createActor('session', (context: ActorContext) => {
        let token: string | undefined;
        const listener = (envelope: AnyEnvelope) => {
            const data = envelope.data as { type?: string; token?: string } | null;
            if (data?.type === 'authenticated') token = data.token;
            if (data?.type === 'whoami') response(context, envelope, { user: 'you', token });
        };
        context.addEventListener('message', listener);
        return () => context.removeEventListener('message', listener);
    });

    const chatList = createActor('chat-list', (context: ActorContext) => {
        let conversations: unknown[] = [];
        const listener = (envelope: AnyEnvelope) => {
            const data = envelope.data as { type?: string; conversations?: unknown[] } | null;
            if (data?.type === 'conversations-loaded') conversations = data.conversations ?? [];
            if (data?.type === 'list-conversations') response(context, envelope, conversations);
        };
        context.addEventListener('message', listener);
        return () => context.removeEventListener('message', listener);
    });

    let chatViewContext: ActorContext | undefined;
    const chatView = createActor('chat-view', (context: ActorContext) => {
        chatViewContext = context;
        return onActorMessage(context, (data) => {
            const message = data as { from?: string } | null;
            if (message?.from !== undefined) counters.messagesReceived += 1;
        });
    });

    const composer = createActor('composer', (context: ActorContext) => {
        let draft = '';
        const listener = (envelope: AnyEnvelope) => {
            const data = envelope.data as { type?: string; char?: string } | null;
            if (data?.type === 'keypress') draft += data.char ?? '';
            if (data?.type === 'clear-draft') draft = '';
            if (data?.type === 'read-draft') response(context, envelope, { draft });
        };
        context.addEventListener('message', listener);
        return () => context.removeEventListener('message', listener);
    });

    const notifications = createActor('notifications', (context: ActorContext) => {
        return onActorMessage(context, () => {});
    });

    const analytics = createActor('analytics', (context: ActorContext) => {
        return onActorMessage(context, () => {});
    });

    const uploader = applyActorSupervisor(
        () =>
            createActor('uploader', (context: ActorContext) => {
                return onActorMessage(context, (data) => {
                    if ((data as { type?: string })?.type !== 'upload') return;
                    if (random() < 0.35) {
                        counters.uploadCrashes += 1;
                        context.close('upload-failed');
                    }
                });
            }),
        { shouldRetry: (reason) => running && reason === 'upload-failed' },
    );

    const apiWorker = new Worker(new URL('../workers/api.worker.ts', import.meta.url), {
        type: 'module',
        name: 'api',
    });
    const chatWorker = new Worker(new URL('../workers/chat.worker.ts', import.meta.url), {
        type: 'module',
        name: 'chat',
    });
    const storageWorker = new Worker(new URL('../workers/storage.worker.ts', import.meta.url), {
        type: 'module',
        name: 'storage',
    });
    const syncWorker = new SharedWorker(new URL('../workers/sync.worker.ts', import.meta.url), {
        type: 'module',
        name: 'tab-sync',
    });

    let apiContext: ActorContext | undefined;
    const apiClient = createActor('api-client', (context: ActorContext) => {
        apiContext = context;
        return onActorMessage(context, () => {});
    });

    let storageContext: ActorContext | undefined;
    const storageClient = createActor('storage-client', (context: ActorContext) => {
        storageContext = context;
        return onActorMessage(context, () => {});
    });

    let syncContext: ActorContext | undefined;
    const tabSync = createActor('tab-sync', (context: ActorContext) => {
        syncContext = context;
        return onActorMessage(context, (data) => {
            if ((data as { type?: string })?.type === 'peer-activity') {
                notifications.postMessage({ type: 'toast', reason: 'peer-activity' } as never);
            }
        });
    });

    const actors = [
        shell,
        session,
        chatList,
        chatView,
        composer,
        notifications,
        analytics,
        uploader,
        apiClient,
        storageClient,
        tabSync,
    ];

    const connections = [
        connectActors(shell, session),
        connectActors(shell, chatList),
        connectActors(shell, chatView),
        connectActors(shell, notifications),
        connectActors(shell, analytics),
        connectActors(shell, uploader),
        connectActors(shell, apiClient),
        connectActors(shell, storageClient),
        connectActors(shell, tabSync),
        connectActors(chatView, composer),
        connectActors(chatView, chatList),
        connectActorToWorker(apiClient, apiWorker),
        connectActorToWorker(chatView, chatWorker),
        connectActorToWorker(storageClient, storageWorker),
        connectActorToWorker(tabSync, syncWorker),
    ];

    for (const actor of actors) actor.launch();

    let conversation: ChannelTransmitter | undefined;
    let conversationPeer = '';

    const closeConversation = () => {
        conversation?.close();
        conversation = undefined;
    };

    disposers.push(() => {
        abort.abort();
        closeConversation();
        for (const disconnect of connections) disconnect();
        for (const actor of actors) actor.close();
        apiWorker.terminate();
        chatWorker.terminate();
        storageWorker.terminate();
        syncWorker.port.close();
    });

    const track = (event: string) => {
        counters.analyticsEvents += 1;
        analytics.postMessage({ type: 'track', event, at: Date.now() } as never);
    };

    const call = async (payload: Record<string, unknown>) => {
        if (apiContext === undefined) return undefined;
        try {
            const envelope = await request(apiContext, payload, { abortSignal: abort.signal });
            return envelope.data;
        } catch {
            return undefined;
        }
    };

    const boot = async () => {
        activity = 'signing in';
        const auth = (await call({ type: 'auth' })) as { token?: string } | undefined;
        shellContext?.postMessage({ type: 'authenticated', token: auth?.token } as never);
        track('session-start');

        await sleep(between(200, 500));
        activity = 'loading conversations';
        const conversations = await call({ type: 'conversations' });
        shellContext?.postMessage({ type: 'conversations-loaded', conversations } as never);
        syncContext?.postMessage({ type: 'presence' } as never);
        track('conversations-loaded');
    };

    const openConversation = async () => {
        if (chatViewContext === undefined) return;
        closeConversation();

        conversationPeer = pick(['ada', 'grace', 'linus', 'margaret']);
        activity = `opening chat with ${conversationPeer}`;
        counters.chatsOpened += 1;
        track('open-conversation');

        try {
            conversation = await openChannel(chatViewContext, OPEN_CONVERSATION, { abortSignal: abort.signal });
            conversation.addEventListener('message', (envelope: AnyEnvelope) => {
                const data = envelope.data as { from?: string } | null;
                if (data?.from !== undefined) counters.messagesReceived += 1;
            });
        } catch {
            conversation = undefined;
        }

        await sleep(between(300, 900));
        activity = 'reading history';
        counters.historyPages += 1;
        await call({ type: 'history', page: 0 });
    };

    const typeAndSend = async () => {
        const text = pick(DRAFTS);
        activity = `typing to ${conversationPeer || 'nobody'}`;

        for (const char of text) {
            if (!running) return;
            counters.keystrokes += 1;
            composer.postMessage({ type: 'keypress', char } as never);
            if (counters.keystrokes % 8 === 0) {
                storageContext?.postMessage({ type: 'save-draft', chatId: 0, draft: text } as never);
            }
            await sleep(between(45, 160));
        }

        await sleep(between(200, 700));
        activity = 'sending message';
        counters.messagesSent += 1;
        conversation?.postMessage({ text, at: Date.now() } as never);
        syncContext?.postMessage({ type: 'outgoing' } as never);
        await call({ type: 'send-message', text });
        composer.postMessage({ type: 'clear-draft' } as never);
        track('message-sent');
    };

    const search = async () => {
        const query = pick(QUERIES);
        activity = `searching "${query}"`;
        counters.searches += 1;

        let typed = '';
        for (const char of query) {
            if (!running) return;
            typed += char;
            counters.keystrokes += 1;
            shellContext?.postMessage({ type: 'search-input', value: typed } as never);
            await sleep(between(60, 180));
        }

        await sleep(between(150, 350));
        await call({ type: 'search', query: typed });
        track('search');
    };

    const scrollBack = async () => {
        activity = 'scrolling history';
        for (let page = 1; page <= Math.round(between(1, 3)); page++) {
            if (!running) return;
            counters.historyPages += 1;
            await call({ type: 'history', page });
            await sleep(between(400, 1100));
        }
    };

    const attach = async () => {
        activity = 'uploading attachment';
        counters.uploads += 1;
        uploader.postMessage({ type: 'upload', size: Math.round(between(20_000, 400_000)) } as never);
        track('upload');
        await sleep(between(600, 1600));
    };

    const idle = async () => {
        activity = 'idle';
        syncContext?.postMessage({ type: 'presence' } as never);
        await sleep(between(2500, 6000));
    };

    const behaviour: [number, () => Promise<void>][] = [
        [30, typeAndSend],
        [16, idle],
        [14, openConversation],
        [12, search],
        [12, scrollBack],
        [8, attach],
    ];
    const totalWeight = behaviour.reduce((sum, [weight]) => sum + weight, 0);

    const nextAction = () => {
        let roll = random() * totalWeight;
        for (const [weight, action] of behaviour) {
            roll -= weight;
            if (roll <= 0) return action;
        }
        return idle;
    };

    void (async () => {
        try {
            await boot();
            await openConversation();
            while (running) {
                await nextAction()();
                if (!running) break;
                activity = 'thinking';
                await sleep(between(700, 2600));
            }
        } catch {
            /* the user simply left the page */
        }
    })();

    return simulationStats();
}

export function stopSimulation(): SimulationStats {
    const stats = simulationStats();
    running = false;
    activity = 'stopped';

    for (const dispose of disposers.reverse()) {
        try {
            dispose();
        } catch {
            /* teardown is best effort */
        }
    }
    disposers = [];

    return { ...stats, running: false, activity: 'stopped' };
}

export function simulationStats(): SimulationStats {
    return {
        running,
        uptimeMs: running ? Math.round(performance.now() - startedAt) : 0,
        activity,
        ...counters,
    };
}
