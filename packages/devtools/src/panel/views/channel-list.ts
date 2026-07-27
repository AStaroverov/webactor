import type { DevtoolsChannel } from 'webactor';
import type { ChannelPair, Store } from '../store';

export type ChannelListInput = {
    container: HTMLElement;
    counter: HTMLElement;
    store: Store;
    selectedChannel: string | undefined;
    onPick: (channelId: string) => void;
};

const SIDE_LABEL: Record<string, string> = { open: 'opener', support: 'supporter' };

function nameOf(store: Store, id: string | undefined): string | undefined {
    return id === undefined ? undefined : (store.nodes.get(id)?.name ?? id.split('<')[0]);
}

/** The worst state of the two halves: a channel is only as open as its weaker side. */
function stateOf(pair: ChannelPair): DevtoolsChannel['state'] {
    const order: DevtoolsChannel['state'][] = ['failed', 'closed', 'opening', 'open'];
    let worst: DevtoolsChannel['state'] = 'open';
    for (const side of pair.sides) {
        if (order.indexOf(side.state) < order.indexOf(worst)) worst = side.state;
    }
    return worst;
}

function reasonText(pair: ChannelPair): string | undefined {
    for (const side of pair.sides) {
        const reason = side.reason as { __wa?: string; message?: string } | string | undefined;
        if (reason === undefined) continue;
        if (typeof reason === 'string') return reason;
        if (typeof reason.message === 'string') return reason.message;
        return String(reason.__wa ?? reason);
    }
    return undefined;
}

function element(tag: string, className?: string, text?: string): HTMLElement {
    const node = document.createElement(tag);
    if (className !== undefined) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function buildRow(pair: ChannelPair, input: ChannelListInput): HTMLElement {
    const { store, selectedChannel, onPick } = input;
    const state = stateOf(pair);

    const row = element('div', `channel-row state-${state}`);
    if (pair.channelId === selectedChannel) row.classList.add('selected');
    row.title = `channel ${pair.channelId}`;

    row.append(element('span', 'channel-name', pair.name ?? pair.channelId));

    const flow = element('span', 'channel-flow');
    const parts = pair.sides
        .slice()
        .sort((a, b) => a.side.localeCompare(b.side))
        .map((side) => `${nameOf(store, side.ownerId) ?? SIDE_LABEL[side.side]} · ${side.thread}`);
    flow.textContent = parts.join(pair.sides.length > 1 ? '  ⇄  ' : '');
    flow.title = parts.join(' ⇄ ');
    row.append(flow);

    const meta = element('span', 'channel-meta');
    const traffic = store.messagesForChannel(pair.channelId).length;
    const reason = reasonText(pair);
    meta.textContent = state === 'open' ? `${traffic} msg` : `${state}${reason === undefined ? '' : ` · ${reason}`}`;
    meta.title = meta.textContent;
    row.append(meta);

    if (pair.sides.length === 1) row.append(element('span', 'channel-lonely', '½'));

    row.addEventListener('click', () => onPick(pair.channelId));
    return row;
}

export function renderChannelList(input: ChannelListInput): void {
    const { container, counter, store } = input;
    container.textContent = '';

    const pairs = store.channelPairs;
    const live = pairs.filter((pair) => pair.settledAt === undefined).length;
    counter.textContent = pairs.length === 0 ? '' : `${live} open of ${pairs.length}`;

    if (pairs.length === 0) {
        container.append(element('div', 'empty-list', 'no channels opened yet'));
        return;
    }

    const fragment = document.createDocumentFragment();
    for (const pair of pairs) fragment.append(buildRow(pair, input));
    container.append(fragment);
}
