import type { DevtoolsNode } from 'webactor';
import { dom } from './elements';
import { createMessageFilter, type MessageFilter } from './filter';
import { GraphView } from './graph';
import { Store } from './store';
import { readTheme } from './theme';
import { connect } from './transport';
import { type Direction, renderMessageList } from './views/message-list';
import { renderNodeDetails } from './views/node-details';
import { renderPayload } from './views/payload';
import { renderWatchList } from './views/watch-list';

const LIST_REFRESH_INTERVAL = 250;
const MIN_GRAPH_WIDTH = 200;
const MIN_DETAILS_WIDTH = 260;

const store = new Store();
const graph = new GraphView(dom.canvas, store, readTheme());

let recording = true;
let direction: Direction = 'all';
let selectedNode: string | undefined;
let selectedMessage: string | undefined;
let listDirty = false;
let pane: 'actor' | 'watch' = 'actor';
let watchFilter: MessageFilter = createMessageFilter('');

const transport = connect((message) => {
    if (message.kind === 'status') {
        dom.statusLabel.textContent = message.present ? 'connected' : 'webactor not detected on this page';
        dom.statusLabel.classList.toggle('live', message.present);
        return;
    }

    if (message.kind === 'reset') {
        store.reset();
        selectRoot(undefined);
        graph.invalidate();
        return;
    }

    const delta = store.apply(message.events);
    if (delta.graphChanged) {
        graph.invalidate();
        syncThreadOptions();
        if (selectedNode !== undefined) showNodeDetails();
    }
    for (const entry of delta.messages) graph.spawn(entry);
    if (delta.messages.length > 0) listDirty = true;
    if (delta.graphChanged || delta.messages.length > 0) dom.countsLabel.textContent = summary();
});

function summary(): string {
    let live = 0;
    for (const node of store.nodes.values()) if (node.state !== 'closed') live += 1;
    return `${live} live / ${store.nodes.size} nodes · ${store.liveLinks} links · ${store.messages.length} messages`;
}

function nameOf(id: string): string {
    return store.nodes.get(id)?.name ?? id.split('<')[0];
}

function nodeVisible(node: DevtoolsNode): boolean {
    if (!dom.portsInput.checked && node.kind === 'port') return false;
    const thread = dom.threadSelect.value;
    if (thread !== '' && node.thread !== thread) return false;
    const query = dom.searchInput.value.trim().toLowerCase();
    return query === '' || node.name.toLowerCase().includes(query);
}

function syncThreadOptions(): void {
    const threads = store.threads;
    const current = dom.threadSelect.value;
    if (dom.threadSelect.options.length - 1 === threads.length) return;

    dom.threadSelect.textContent = '';
    dom.threadSelect.append(new Option('all threads', ''));
    for (const thread of threads) dom.threadSelect.append(new Option(thread, thread));
    dom.threadSelect.value = threads.includes(current) ? current : '';
}

function showNodeDetails(): void {
    graph.selected = selectedNode;
    renderNodeDetails(dom.nodeHeader, store, selectedNode);
}

function showMessages(): void {
    listDirty = false;
    renderMessageList({
        container: dom.messagesList,
        counter: dom.messageCount,
        store,
        selectedNode,
        selectedMessage,
        direction,
        onPick: (message) => {
            selectedMessage = message.seq;
            renderPayload(dom.payloadView, message.preview);
        },
        onOpenPeer: (peerId) => {
            selectedNode = peerId;
            graph.focus(peerId);
            showNodeDetails();
            showMessages();
        },
    });
}

function showWatch(): void {
    listDirty = false;
    renderWatchList({
        container: dom.watchList,
        counter: dom.watchCount,
        store,
        filter: watchFilter,
        selectedMessage,
        onPick: (message) => {
            selectedMessage = message.seq;
            renderPayload(dom.payloadView, message.preview);
        },
        onOpenNode: (nodeId) => {
            selectedNode = nodeId;
            graph.focus(nodeId);
            showNodeDetails();
        },
    });
}

function refreshActivePane(): void {
    if (pane === 'watch') showWatch();
    else showMessages();
}

function showPane(next: 'actor' | 'watch'): void {
    pane = next;
    dom.paneActorButton.classList.toggle('active', next === 'actor');
    dom.paneWatchButton.classList.toggle('active', next === 'watch');
    dom.paneActorView.hidden = next !== 'actor';
    dom.paneWatchView.hidden = next !== 'watch';
    refreshActivePane();
}

function selectRoot(id: string | undefined): void {
    selectedNode = id;
    selectedMessage = undefined;
    showNodeDetails();
    refreshActivePane();
    renderPayload(dom.payloadView, undefined);
}

graph.filter = nodeVisible;
graph.onSelect = selectRoot;

dom.paneActorButton.addEventListener('click', () => showPane('actor'));
dom.paneWatchButton.addEventListener('click', () => showPane('watch'));

dom.watchFilter.addEventListener('input', () => {
    watchFilter = createMessageFilter(dom.watchFilter.value);
    graph.highlight = (message) => !watchFilter.empty && watchFilter.matches(message, nameOf);
    showWatch();
});

dom.recordButton.addEventListener('click', () => {
    recording = !recording;
    dom.recordButton.classList.toggle('paused', !recording);
    dom.recordLabel.textContent = recording ? 'Recording' : 'Paused';
    transport.send({ kind: recording ? 'start' : 'stop' });
});

dom.clearButton.addEventListener('click', () => transport.send({ kind: 'clear' }));
dom.fitButton.addEventListener('click', () => graph.resetView());

dom.searchInput.addEventListener('input', () => graph.invalidate());
dom.threadSelect.addEventListener('change', () => graph.invalidate());
dom.portsInput.addEventListener('change', () => graph.invalidate());
dom.animateInput.addEventListener('change', () => {
    graph.animate = dom.animateInput.checked;
});
dom.payloadInput.addEventListener('change', () => {
    transport.send({ kind: 'options', options: { capturePayload: dom.payloadInput.checked } });
});

for (const button of document.querySelectorAll<HTMLButtonElement>('.tabs button')) {
    button.addEventListener('click', () => {
        for (const other of document.querySelectorAll('.tabs button')) other.classList.remove('active');
        button.classList.add('active');
        direction = (button.dataset.direction as Direction) ?? 'all';
        showMessages();
    });
}

dom.splitter.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = dom.details.getBoundingClientRect().width;

    const move = (moveEvent: PointerEvent) => {
        const room = window.innerWidth - MIN_GRAPH_WIDTH;
        const width = Math.min(room, Math.max(MIN_DETAILS_WIDTH, startWidth - (moveEvent.clientX - startX)));
        dom.details.style.width = `${width}px`;
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
    if (listDirty) refreshActivePane();
}, LIST_REFRESH_INTERVAL);

chrome.devtools.network.onNavigated.addListener(() => {
    store.reset();
    selectRoot(undefined);
    setTimeout(() => transport.send({ kind: 'start' }), 200);
});

(window as unknown as Record<string, unknown>).__webactorPanel = {
    store,
    graph,
    select: selectRoot,
    showPane,
    setWatchFilter(query: string) {
        dom.watchFilter.value = query;
        dom.watchFilter.dispatchEvent(new Event('input'));
    },
};

selectRoot(undefined);
transport.send({ kind: 'start' });
