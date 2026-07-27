import type { DevtoolsMessage } from 'webactor';
import type { MessageFilter } from '../filter';
import type { Store } from '../store';

const MAX_ROWS = 400;

export type Direction = 'all' | 'in' | 'out';

export type MessageListInput = {
    container: HTMLElement;
    counter: HTMLElement;
    store: Store;
    selectedNode: string | undefined;
    selectedMessage: string | undefined;
    direction: Direction;
    filter: MessageFilter;
    onPick: (message: DevtoolsMessage) => void;
    onOpenPeer: (peerId: string) => void;
};

function placeholder(container: HTMLElement, text: string): void {
    const empty = document.createElement('div');
    empty.className = 'empty-list';
    empty.textContent = text;
    container.append(empty);
}

function peerName(store: Store, id: string): string {
    return store.nodes.get(id)?.name ?? id.split('<')[0];
}

function buildRow(message: DevtoolsMessage, input: MessageListInput): HTMLElement {
    const { store, selectedNode, selectedMessage, onPick, onOpenPeer } = input;
    const outgoing = message.source === selectedNode;
    const peerId = outgoing ? message.target : message.source;

    const row = document.createElement('div');
    row.className = `message type-${message.type}${message.delivered ? '' : ' dropped'}`;
    if (message.seq === selectedMessage) row.classList.add('selected');

    const time = document.createElement('span');
    time.className = 'time';
    time.textContent = new Date(message.ts).toLocaleTimeString([], { hour12: false }).slice(0, 8);

    const dir = document.createElement('span');
    dir.className = `dir ${outgoing ? 'out' : 'in'}`;
    dir.textContent = outgoing ? '→' : '←';

    const peer = document.createElement('span');
    peer.className = 'peer';
    peer.textContent = `${peerName(store, peerId)}${message.type === 'message' ? '' : ` · ${message.type}`}`;
    peer.title = peerId;

    const size = document.createElement('span');
    size.className = 'size';
    size.textContent = `${message.bytes}b`;

    row.append(time, dir, peer, size);

    row.addEventListener('click', () => {
        onPick(message);
        for (const other of input.container.children) other.classList.remove('selected');
        row.classList.add('selected');
    });
    row.addEventListener('dblclick', () => onOpenPeer(peerId));

    return row;
}

export function renderMessageList(input: MessageListInput): void {
    const { container, counter, store, selectedNode, direction, filter } = input;
    container.textContent = '';

    if (selectedNode === undefined) {
        counter.textContent = '';
        placeholder(container, 'no actor selected');
        return;
    }

    const all = store.messagesFor(selectedNode);
    const filtered = all.filter((message) => {
        if (direction === 'in' && message.target !== selectedNode) return false;
        if (direction === 'out' && message.source !== selectedNode) return false;
        return filter.matches(message, (id) => peerName(store, id));
    });

    counter.textContent = `${filtered.length} of ${all.length}`;

    if (filtered.length === 0) {
        placeholder(container, filter.empty ? 'no messages captured for this actor' : 'nothing matches this filter');
        return;
    }

    const fragment = document.createDocumentFragment();
    for (const message of filtered.slice(-MAX_ROWS)) fragment.append(buildRow(message, input));

    container.append(fragment);
    container.scrollTop = container.scrollHeight;
}
