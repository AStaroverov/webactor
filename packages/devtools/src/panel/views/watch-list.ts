import type { DevtoolsMessage } from 'webactor';
import type { MessageFilter } from '../filter';
import type { Store } from '../store';

const MAX_ROWS = 300;

export type WatchListInput = {
    container: HTMLElement;
    counter: HTMLElement;
    store: Store;
    filter: MessageFilter;
    selectedMessage: string | undefined;
    onPick: (message: DevtoolsMessage) => void;
    onOpenNode: (nodeId: string) => void;
};

function nameOf(store: Store, id: string): string {
    return store.nodes.get(id)?.name ?? id.split('<')[0];
}

function endpoint(label: string, nodeId: string, onOpen: (nodeId: string) => void): HTMLElement {
    const span = document.createElement('span');
    span.className = 'endpoint';
    span.textContent = label;
    span.title = nodeId;
    span.addEventListener('click', (event) => {
        event.stopPropagation();
        onOpen(nodeId);
    });
    return span;
}

function buildRow(message: DevtoolsMessage, input: WatchListInput): HTMLElement {
    const { store, selectedMessage, onPick, onOpenNode } = input;

    const row = document.createElement('div');
    row.className = `watch-row type-${message.type}${message.delivered ? '' : ' dropped'}`;
    if (message.seq === selectedMessage) row.classList.add('selected');

    const time = document.createElement('span');
    time.className = 'time';
    time.textContent = new Date(message.ts).toLocaleTimeString([], { hour12: false }).slice(0, 8);

    const flow = document.createElement('span');
    flow.className = 'flow';
    const arrow = document.createElement('span');
    arrow.className = 'arrow';
    arrow.textContent = '→';
    flow.append(
        endpoint(nameOf(store, message.source), message.source, onOpenNode),
        arrow,
        endpoint(nameOf(store, message.target), message.target, onOpenNode),
    );

    const meta = document.createElement('span');
    meta.className = 'meta';
    meta.textContent = message.type === 'message' ? `${message.bytes}b` : `${message.type} · ${message.bytes}b`;

    row.append(time, flow, meta);
    row.addEventListener('click', () => {
        onPick(message);
        for (const other of input.container.children) other.classList.remove('selected');
        row.classList.add('selected');
    });

    return row;
}

export function renderWatchList(input: WatchListInput): void {
    const { container, counter, store, filter } = input;
    container.textContent = '';

    const matched: DevtoolsMessage[] = [];
    for (let i = store.messages.length - 1; i >= 0 && matched.length < MAX_ROWS; i--) {
        const message = store.messages[i];
        if (filter.matches(message, (id) => nameOf(store, id))) matched.push(message);
    }
    matched.reverse();

    counter.textContent = filter.empty
        ? `${store.messages.length} captured`
        : `${matched.length}${matched.length === MAX_ROWS ? '+' : ''} of ${store.messages.length}`;

    if (matched.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-list';
        empty.textContent = filter.empty ? 'no messages captured yet' : 'nothing matches this filter';
        container.append(empty);
        return;
    }

    const fragment = document.createDocumentFragment();
    for (const message of matched) fragment.append(buildRow(message, input));

    container.append(fragment);
    container.scrollTop = container.scrollHeight;
}
