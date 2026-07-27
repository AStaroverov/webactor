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

export type SimulationCounters = {
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

export type SimulationActionName =
    | 'sign-in'
    | 'open-chat'
    | 'close-chat'
    | 'type-and-send'
    | 'search'
    | 'scroll-history'
    | 'upload'
    | 'idle';

/** The weight is how often the autonomous loop picks the action; 0 means only a hand can trigger it. */
export const SIMULATION_ACTIONS: {
    name: SimulationActionName;
    label: string;
    hint: string;
    weight: number;
}[] = [
    { name: 'sign-in', label: 'sign in', hint: 'auth, then load the conversation list', weight: 0 },
    { name: 'open-chat', label: 'open chat', hint: 'opens a channel into the chat worker', weight: 14 },
    { name: 'close-chat', label: 'close chat', hint: 'closes that channel', weight: 0 },
    { name: 'type-and-send', label: 'type & send', hint: 'keystrokes, draft saves, one message out', weight: 30 },
    { name: 'search', label: 'search', hint: 'typed query, then one api call', weight: 12 },
    { name: 'scroll-history', label: 'scroll history', hint: '1-3 paged api calls', weight: 12 },
    { name: 'upload', label: 'upload', hint: 'attachment that fails ~1 in 3 and gets restarted', weight: 8 },
    { name: 'idle', label: 'idle ping', hint: 'presence to the shared worker', weight: 16 },
];

export type SimulationApp = {
    readonly alive: boolean;
    readonly counters: SimulationCounters;
    readonly activity: string;
    readonly actions: Record<SimulationActionName, () => Promise<void>>;
    setActivity: (activity: string) => void;
    /** Seeded, so a hand-driven run and a loop-driven run jitter the same way. */
    between: (from: number, to: number) => number;
    dispose: VoidFunction;
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

/**
 * A chat app as a real site would wire it: a shell fanning out to feature actors, three dedicated
 * workers behind their own clients and a shared worker for tab sync. Nothing here drives itself — the
 * returned actions are the things a user does, one per gesture.
 */
export function createSimulationApp(): SimulationApp {
    const counters: SimulationCounters = {
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

    let alive = true;
    let activity = 'idle';

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
        { shouldRetry: (reason) => alive && reason === 'upload-failed' },
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
                notifications.postMessage({ type: 'toast', reason: 'peer-activity' });
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

    const track = (event: string) => {
        counters.analyticsEvents += 1;
        analytics.postMessage({ type: 'track', event, at: Date.now() });
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

    const closeChat = async () => {
        if (conversation === undefined) return;
        activity = `closing chat with ${conversationPeer}`;
        conversation.close();
        conversation = undefined;
        track('close-conversation');
        await sleep(between(100, 300));
    };

    const signIn = async () => {
        activity = 'signing in';
        const auth = (await call({ type: 'auth' })) as { token?: string } | undefined;
        shellContext?.postMessage({ type: 'authenticated', token: auth?.token });
        track('session-start');

        await sleep(between(200, 500));
        activity = 'loading conversations';
        const conversations = await call({ type: 'conversations' });
        shellContext?.postMessage({ type: 'conversations-loaded', conversations });
        syncContext?.postMessage({ type: 'presence' });
        track('conversations-loaded');
    };

    const openChat = async () => {
        if (chatViewContext === undefined) return;
        await closeChat();

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
            if (!alive) return;
            counters.keystrokes += 1;
            composer.postMessage({ type: 'keypress', char });
            if (counters.keystrokes % 8 === 0) {
                storageContext?.postMessage({ type: 'save-draft', chatId: 0, draft: text });
            }
            await sleep(between(45, 160));
        }

        await sleep(between(200, 700));
        activity = 'sending message';
        counters.messagesSent += 1;
        conversation?.postMessage({ text, at: Date.now() });
        syncContext?.postMessage({ type: 'outgoing' });
        await call({ type: 'send-message', text });
        composer.postMessage({ type: 'clear-draft' });
        track('message-sent');
    };

    const search = async () => {
        const query = pick(QUERIES);
        activity = `searching "${query}"`;
        counters.searches += 1;

        let typed = '';
        for (const char of query) {
            if (!alive) return;
            typed += char;
            counters.keystrokes += 1;
            shellContext?.postMessage({ type: 'search-input', value: typed });
            await sleep(between(60, 180));
        }

        await sleep(between(150, 350));
        await call({ type: 'search', query: typed });
        track('search');
    };

    const scrollHistory = async () => {
        activity = 'scrolling history';
        for (let page = 1; page <= Math.round(between(1, 3)); page++) {
            if (!alive) return;
            counters.historyPages += 1;
            await call({ type: 'history', page });
            await sleep(between(400, 1100));
        }
    };

    const upload = async () => {
        activity = 'uploading attachment';
        counters.uploads += 1;
        uploader.postMessage({ type: 'upload', size: Math.round(between(20_000, 400_000)) });
        track('upload');
        await sleep(between(600, 1600));
    };

    const idle = async () => {
        activity = 'idle';
        syncContext?.postMessage({ type: 'presence' });
        await sleep(between(2500, 6000));
    };

    return {
        get alive() {
            return alive;
        },
        get activity() {
            return activity;
        },
        counters,
        between,
        setActivity: (next: string) => {
            activity = next;
        },
        actions: {
            'sign-in': signIn,
            'open-chat': openChat,
            'close-chat': closeChat,
            'type-and-send': typeAndSend,
            search,
            'scroll-history': scrollHistory,
            upload,
            idle,
        },
        dispose: () => {
            if (!alive) return;
            alive = false;
            activity = 'gone';
            abort.abort();
            conversation?.close();
            conversation = undefined;
            for (const disconnect of connections) disconnect();
            for (const actor of actors) actor.close();
            apiWorker.terminate();
            chatWorker.terminate();
            storageWorker.terminate();
            syncWorker.port.close();
        },
    };
}
