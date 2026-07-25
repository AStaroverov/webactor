import type { DevtoolsEvent } from 'webactor';
import { isPanelCommand, PAGE_SOURCE, type PageMessage } from './protocol';

type RecorderApi = {
    snapshotEvents: () => DevtoolsEvent[];
    setOptions: (options: Record<string, unknown>) => void;
    clear: () => void;
};

const HOOK_KEY = '__WEBACTOR_DEVTOOLS_HOOK__';
const GLOBAL_KEY = '__WEBACTOR_DEVTOOLS__';
// Coalesces the recorder's task-boundary batches into one window.postMessage per frame-ish.
const FLUSH_INTERVAL = 40;
const MAX_QUEUE = 20000;

const scope = window as unknown as Record<string, unknown>;

if (scope[HOOK_KEY] === undefined) {
    let streaming = false;
    let queue: DevtoolsEvent[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;

    const send = (message: PageMessage) => window.postMessage(message, '*');

    const recorder = () => scope[GLOBAL_KEY] as RecorderApi | undefined;

    const pump = () => {
        timer = undefined;
        if (queue.length === 0) return;
        const events = queue;
        queue = [];
        send({ source: PAGE_SOURCE, kind: 'events', events });
    };

    const schedule = () => {
        if (timer === undefined) timer = setTimeout(pump, FLUSH_INTERVAL);
    };

    scope[HOOK_KEY] = {
        onEvents(events: DevtoolsEvent[]) {
            if (!streaming) return;
            queue.push(...events);
            if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
            schedule();
        },
    };

    const reportStatus = () => {
        const api = recorder();
        send({ source: PAGE_SOURCE, kind: 'status', present: api !== undefined, thread: 'window' });
    };

    window.addEventListener('message', (event: MessageEvent) => {
        if (event.source !== window) return;
        const command = event.data;
        if (!isPanelCommand(command)) return;

        switch (command.kind) {
            case 'start': {
                streaming = true;
                reportStatus();
                const api = recorder();
                if (api === undefined) return;
                send({ source: PAGE_SOURCE, kind: 'reset' });
                const snapshot = api.snapshotEvents();
                for (let i = 0; i < snapshot.length; i += 2000) {
                    send({ source: PAGE_SOURCE, kind: 'events', events: snapshot.slice(i, i + 2000) });
                }
                break;
            }
            case 'stop':
                streaming = false;
                queue = [];
                break;
            case 'clear':
                queue = [];
                recorder()?.clear();
                send({ source: PAGE_SOURCE, kind: 'reset' });
                break;
            case 'options':
                recorder()?.setOptions(command.options as Record<string, unknown>);
                break;
        }
    });
}
