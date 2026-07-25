import type { DevtoolsNode } from 'webactor';
import { isPageMessage, PANEL_SOURCE, type PanelCommand } from '../protocol';
import { GraphView, type GraphTheme } from './graph';
import { renderPayload } from './inspector';
import { Store } from './store';

const MAX_ROWS = 400;

const byId = <T extends HTMLElement>(id: string): T => {
    const element = document.getElementById(id);
    if (element === null) throw new Error(`missing element #${id}`);
    return element as T;
};

const recordButton = byId<HTMLButtonElement>('record');
const recordLabel = byId('record-label');
const clearButton = byId<HTMLButtonElement>('clear');
const fitButton = byId<HTMLButtonElement>('fit');
const searchInput = byId<HTMLInputElement>('search');
const threadSelect = byId<HTMLSelectElement>('thread');
const animateInput = byId<HTMLInputElement>('animate');
const payloadInput = byId<HTMLInputElement>('payload');
const portsInput = byId<HTMLInputElement>('ports');
const statusLabel = byId('status');
const countsLabel = byId('counts');
const canvas = byId<HTMLCanvasElement>('canvas');
const nodeHeader = byId('node-header');
const messagesList = byId('messages');
const messageCount = byId('message-count');
const payloadView = byId('payload-view');
const splitter = byId('splitter');
const details = document.querySelector('.details') as HTMLElement;

const store = new Store();

function readTheme(): GraphTheme {
    const styles = getComputedStyle(document.documentElement);
    const value = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
    return {
        background: value('--bg-graph', '#17181a'),
        edge: value('--border', '#34363b'),
        edgeCross: '#7c8794',
        label: value('--text', '#e6e6e6'),
        labelMuted: value('--text-muted', '#9aa0a6'),
        selection: value('--accent', '#7cacf8'),
        threadBand: value('--border', '#34363b'),
        threadLabel: value('--text-muted', '#9aa0a6'),
    };
}

const graph = new GraphView(canvas, store, readTheme());

let recording = true;
let direction: 'all' | 'in' | 'out' = 'all';
let selectedNode: string | undefined;
let selectedMessage: string | undefined;
let listDirty = false;

const port = chrome.runtime.connect({ name: 'webactor-panel' });
port.postMessage({ kind: 'init', tabId: chrome.devtools.inspectedWindow.tabId });

type PanelCommandBody = PanelCommand extends infer T ? (T extends PanelCommand ? Omit<T, 'source'> : never) : never;

function send(command: PanelCommandBody): void {
    port.postMessage({ source: PANEL_SOURCE, ...command } as PanelCommand);
}

function nodeVisible(node: DevtoolsNode): boolean {
    if (!portsInput.checked && node.kind === 'port') return false;
    const thread = threadSelect.value;
    if (thread !== '' && node.thread !== thread) return false;
    const query = searchInput.value.trim().toLowerCase();
    if (query !== '' && !node.name.toLowerCase().includes(query)) return false;
    return true;
}

graph.filter = nodeVisible;
graph.onSelect = (id) => {
    selectedNode = id;
    selectedMessage = undefined;
    renderNodeHeader();
    renderMessages();
    renderPayload(payloadView, undefined);
};

port.onMessage.addListener((message: unknown) => {
    if (!isPageMessage(message)) return;

    if (message.kind === 'status') {
        statusLabel.textContent = message.present ? 'connected' : 'webactor not detected on this page';
        statusLabel.classList.toggle('live', message.present);
        return;
    }

    if (message.kind === 'reset') {
        store.reset();
        selectedNode = undefined;
        selectedMessage = undefined;
        graph.selected = undefined;
        graph.invalidate();
        renderNodeHeader();
        renderMessages();
        renderPayload(payloadView, undefined);
        return;
    }

    const delta = store.apply(message.events);
    if (delta.graphChanged) {
        graph.invalidate();
        syncThreads();
        if (selectedNode !== undefined) renderNodeHeader();
    }
    for (const entry of delta.messages) graph.spawn(entry);
    if (delta.messages.length > 0) listDirty = true;
    if (delta.graphChanged || delta.messages.length > 0) countsLabel.textContent = summary();
});

function summary(): string {
    let open = 0;
    for (const node of store.nodes.values()) if (node.state !== 'closed') open += 1;
    return `${open} live / ${store.nodes.size} nodes · ${store.liveLinks} links · ${store.messages.length} messages`;
}

function syncThreads(): void {
    const threads = store.threads;
    const current = threadSelect.value;
    if (threadSelect.options.length - 1 === threads.length) return;
    threadSelect.textContent = '';
    threadSelect.append(new Option('all threads', ''));
    for (const thread of threads) threadSelect.append(new Option(thread, thread));
    threadSelect.value = threads.includes(current) ? current : '';
}

function renderNodeHeader(): void {
    graph.selected = selectedNode;
    if (selectedNode === undefined) {
        nodeHeader.className = 'node-header empty';
        nodeHeader.textContent = 'select an actor in the graph';
        return;
    }
    const node = store.nodes.get(selectedNode);
    if (node === undefined) {
        nodeHeader.className = 'node-header empty';
        nodeHeader.textContent = 'node is gone';
        return;
    }

    const links = [...store.links.values()].filter(
        (link) => link.source === selectedNode || link.target === selectedNode,
    );

    nodeHeader.className = 'node-header';
    nodeHeader.textContent = '';
    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = node.name;
    const list = document.createElement('dl');
    const rows: [string, string][] = [
        ['kind', node.kind],
        ['state', node.state],
        ['thread', node.thread],
        ['restarts', String(node.restarts)],
        ['links', String(links.length)],
        ['created', new Date(node.createdAt).toLocaleTimeString()],
        ['id', node.id],
    ];
    for (const [key, value] of rows) {
        const dt = document.createElement('dt');
        dt.textContent = key;
        const dd = document.createElement('dd');
        dd.textContent = value;
        dd.title = value;
        list.append(dt, dd);
    }
    nodeHeader.append(title, list);
}

function peerName(id: string): string {
    return store.nodes.get(id)?.name ?? id.split('<')[0];
}

function renderMessages(): void {
    listDirty = false;
    messagesList.textContent = '';

    if (selectedNode === undefined) {
        messageCount.textContent = '';
        const empty = document.createElement('div');
        empty.className = 'empty-list';
        empty.textContent = 'no actor selected';
        messagesList.append(empty);
        return;
    }

    const all = store.messagesFor(selectedNode);
    const filtered = all.filter((message) => {
        if (direction === 'in') return message.target === selectedNode;
        if (direction === 'out') return message.source === selectedNode;
        return true;
    });

    messageCount.textContent = `${filtered.length} of ${all.length}`;

    if (filtered.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-list';
        empty.textContent = 'no messages captured for this actor';
        messagesList.append(empty);
        return;
    }

    const visible = filtered.slice(-MAX_ROWS);
    const fragment = document.createDocumentFragment();

    for (const message of visible) {
        const outgoing = message.source === selectedNode;
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
        const peerId = outgoing ? message.target : message.source;
        peer.textContent = `${peerName(peerId)}${message.type === 'message' ? '' : ` · ${message.type}`}`;
        peer.title = peerId;

        const size = document.createElement('span');
        size.className = 'size';
        size.textContent = `${message.bytes}b`;

        row.append(time, dir, peer, size);
        row.addEventListener('click', () => {
            selectedMessage = message.seq;
            renderPayload(payloadView, message.preview);
            for (const other of messagesList.children) other.classList.remove('selected');
            row.classList.add('selected');
        });
        row.addEventListener('dblclick', () => {
            selectedNode = peerId;
            graph.focus(peerId);
            renderNodeHeader();
            renderMessages();
        });

        fragment.append(row);
    }

    messagesList.append(fragment);
    messagesList.scrollTop = messagesList.scrollHeight;
}

recordButton.addEventListener('click', () => {
    recording = !recording;
    recordButton.classList.toggle('paused', !recording);
    recordLabel.textContent = recording ? 'Recording' : 'Paused';
    send({ kind: recording ? 'start' : 'stop' });
});

clearButton.addEventListener('click', () => send({ kind: 'clear' }));
fitButton.addEventListener('click', () => graph.resetView());

searchInput.addEventListener('input', () => graph.invalidate());
threadSelect.addEventListener('change', () => graph.invalidate());
portsInput.addEventListener('change', () => graph.invalidate());
animateInput.addEventListener('change', () => {
    graph.animate = animateInput.checked;
});
payloadInput.addEventListener('change', () => {
    send({ kind: 'options', options: { capturePayload: payloadInput.checked } });
});

for (const button of document.querySelectorAll<HTMLButtonElement>('.tabs button')) {
    button.addEventListener('click', () => {
        for (const other of document.querySelectorAll('.tabs button')) other.classList.remove('active');
        button.classList.add('active');
        direction = (button.dataset.direction as typeof direction) ?? 'all';
        renderMessages();
    });
}

splitter.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = details.getBoundingClientRect().width;
    const move = (moveEvent: PointerEvent) => {
        const width = Math.min(window.innerWidth - 200, Math.max(260, startWidth - (moveEvent.clientX - startX)));
        details.style.width = `${width}px`;
        graph.resize();
    };
    const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
});

window.addEventListener('resize', () => graph.resize());
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => graph.setTheme(readTheme()));

setInterval(() => {
    if (listDirty) renderMessages();
}, 250);

(window as unknown as Record<string, unknown>).__webactorPanel = {
    store,
    graph,
    select(id: string | undefined) {
        graph.selected = id;
        graph.onSelect(id);
    },
};

renderNodeHeader();
renderMessages();
renderPayload(payloadView, undefined);
send({ kind: 'start' });

chrome.devtools.network.onNavigated.addListener(() => {
    store.reset();
    selectedNode = undefined;
    graph.selected = undefined;
    renderNodeHeader();
    renderMessages();
    setTimeout(() => send({ kind: 'start' }), 200);
});
