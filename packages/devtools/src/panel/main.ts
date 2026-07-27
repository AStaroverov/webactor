import type { DevtoolsMessage, DevtoolsNode } from 'webactor';
import { refreshAccess, watchAccess } from './access';
import { ChipSet } from './chips';
import { dom } from './elements';
import { createMessageFilter, type MessageFilter } from './filter';
import { GraphView } from './graph';
import { Store } from './store';
import { readTheme } from './theme';
import { connect } from './transport';
import { renderChannelList } from './views/channel-list';
import { renderChipList } from './views/chip-list';
import { renderGlobalList } from './views/global-list';
import { type Direction, renderMessageList } from './views/message-list';
import { renderNodeDetails } from './views/node-details';
import { renderPayload } from './views/payload';

type Pane = 'actor' | 'global' | 'channels';

const LIST_REFRESH_INTERVAL = 250;
const MIN_GRAPH_WIDTH = 200;
const MIN_DETAILS_WIDTH = 260;

const store = new Store();
const graph = new GraphView(dom.canvas, store, readTheme());

let recording = true;
let direction: Direction = 'all';
let selectedNode: string | undefined;
let selectedMessage: string | undefined;
let selectedChannel: string | undefined;
let listDirty = false;
let pane: Pane = 'actor';
let textFilter: MessageFilter = createMessageFilter('');
const pinnedFields = new ChipSet();

const transport = connect((message) => {
    if (message.kind === 'status') {
        dom.statusLabel.textContent = message.present ? 'connected' : 'webactor not detected on this page';
        dom.statusLabel.classList.toggle('live', message.present);
        return;
    }

    if (message.kind === 'reset') {
        store.reset();
        clearFilter();
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
    for (const entry of delta.messages) graph.pulse(entry);
    if (delta.messages.length > 0 || delta.channelsChanged) listDirty = true;
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

/** Raw ports are never drawn: they carry no meaning of their own and collapse into pass-through edges. */
function nodeVisible(node: DevtoolsNode): boolean {
    if (node.kind === 'port') return false;
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

/** One filter for both panes: the chips OR each other, the typed query narrows what they let through. */
function activeFilter(): MessageFilter {
    return {
        empty: textFilter.empty && pinnedFields.empty,
        matches: (message, resolve) => pinnedFields.matches(message) && textFilter.matches(message, resolve),
    };
}

function syncFilter(): void {
    const filter = activeFilter();
    graph.highlight = (message) => !filter.empty && filter.matches(message, nameOf);
    graph.dimUnwatched = !filter.empty;
    refreshActivePane();
}

function pinField(path: string[], value: unknown): void {
    pinnedFields.add(path, value);
    syncFilter();
}

function pickMessage(message: DevtoolsMessage): void {
    selectedMessage = message.seq;
    renderPayload(dom.payloadView, message.preview, pinField);
}

function showNodeDetails(): void {
    graph.selected = selectedNode;
    renderNodeDetails(dom.nodeHeader, store, selectedNode);
}

function showMessages(): void {
    renderMessageList({
        container: dom.messagesList,
        counter: dom.filterCount,
        store,
        selectedNode,
        selectedMessage,
        direction,
        filter: activeFilter(),
        onPick: pickMessage,
        onOpenPeer: openActor,
    });
}

function showGlobal(): void {
    renderGlobalList({
        container: dom.globalList,
        counter: dom.filterCount,
        store,
        filter: activeFilter(),
        selectedMessage,
        onPick: pickMessage,
        onOpenNode: openActor,
    });
}

function showChannels(): void {
    renderChannelList({
        container: dom.channelsList,
        counter: dom.channelsCount,
        store,
        selectedChannel,
        onPick: (channelId) => {
            selectedChannel = channelId === selectedChannel ? undefined : channelId;
            showChannels();
        },
    });

    renderGlobalList({
        container: dom.channelTraffic,
        counter: dom.filterCount,
        store,
        filter: activeFilter(),
        selectedMessage,
        source: selectedChannel === undefined ? [] : store.messagesForChannel(selectedChannel),
        emptyText: selectedChannel === undefined ? 'select a channel above' : 'nothing has travelled this channel yet',
        onPick: pickMessage,
        onOpenNode: openActor,
    });
}

function showChips(): void {
    renderChipList({
        container: dom.filterChips,
        chips: pinnedFields.list(),
        counts: pinnedFields.counts(store.messages),
        onRemove: (id) => {
            pinnedFields.remove(id);
            syncFilter();
        },
        onClear: () => {
            pinnedFields.clear();
            syncFilter();
        },
    });
}

function refreshActivePane(): void {
    listDirty = false;
    showChips();
    if (pane === 'global') showGlobal();
    else if (pane === 'channels') showChannels();
    else showMessages();
}

function showPane(next: Pane): void {
    pane = next;
    for (const [name, button, view] of [
        ['actor', dom.paneActorButton, dom.paneActorView],
        ['global', dom.paneGlobalButton, dom.paneGlobalView],
        ['channels', dom.paneChannelsButton, dom.paneChannelsView],
    ] as const) {
        button.classList.toggle('active', next === name);
        view.hidden = next !== name;
    }
    refreshActivePane();
}

/**
 * Picking an actor is what the Actor pane is for; letting go of one leaves nothing to show there. The
 * Channels pane is a deliberate choice, so a selection never drags the user out of it.
 */
function selectRoot(id: string | undefined): void {
    selectedNode = id;
    selectedMessage = undefined;
    renderPayload(dom.payloadView, undefined);
    showNodeDetails();
    if (pane === 'channels') refreshActivePane();
    else showPane(id === undefined ? 'global' : 'actor');
}

function openActor(id: string): void {
    selectedNode = id;
    graph.focus(id);
    showNodeDetails();
    showPane('actor');
}

function clearFilter(): void {
    pinnedFields.clear();
    textFilter = createMessageFilter('');
    dom.filterInput.value = '';
    syncFilter();
}

graph.filter = nodeVisible;
graph.onSelect = selectRoot;

dom.paneActorButton.addEventListener('click', () => showPane('actor'));
dom.paneGlobalButton.addEventListener('click', () => showPane('global'));
dom.paneChannelsButton.addEventListener('click', () => showPane('channels'));

dom.filterInput.addEventListener('input', () => {
    textFilter = createMessageFilter(dom.filterInput.value);
    syncFilter();
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
dom.flashInput.addEventListener('change', () => {
    graph.flash = dom.flashInput.checked;
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
    clearFilter();
    selectRoot(undefined);
    void refreshAccess();
    setTimeout(() => transport.send({ kind: 'start' }), 200);
});

(window as unknown as Record<string, unknown>).__webactorPanel = {
    store,
    graph,
    select: selectRoot,
    showPane,
    setFilter(query: string) {
        dom.filterInput.value = query;
        dom.filterInput.dispatchEvent(new Event('input'));
    },
    pinnedFields: () => pinnedFields.list().map((chip) => chip.id),
    selectChannel(channelId: string | undefined) {
        selectedChannel = channelId;
        showPane('channels');
    },
};

selectRoot(undefined);
watchAccess();
transport.send({ kind: 'start' });
