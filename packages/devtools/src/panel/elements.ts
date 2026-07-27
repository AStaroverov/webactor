function byId<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (element === null) throw new Error(`missing element #${id}`);
    return element as T;
}

export const dom = {
    canvas: byId<HTMLCanvasElement>('canvas'),
    recordButton: byId<HTMLButtonElement>('record'),
    recordLabel: byId('record-label'),
    clearButton: byId<HTMLButtonElement>('clear'),
    fitButton: byId<HTMLButtonElement>('fit'),
    searchInput: byId<HTMLInputElement>('search'),
    threadSelect: byId<HTMLSelectElement>('thread'),
    flashInput: byId<HTMLInputElement>('flash'),
    payloadInput: byId<HTMLInputElement>('payload'),
    statusLabel: byId('status'),
    accessBar: byId('access'),
    accessText: byId('access-text'),
    accessGrant: byId<HTMLButtonElement>('access-grant'),
    countsLabel: byId('counts'),
    nodeHeader: byId('node-header'),
    messagesList: byId('messages'),
    payloadView: byId('payload-view'),
    paneActorButton: byId<HTMLButtonElement>('pane-actor'),
    paneGlobalButton: byId<HTMLButtonElement>('pane-global'),
    paneChannelsButton: byId<HTMLButtonElement>('pane-channels'),
    paneActorView: byId('pane-actor-view'),
    paneGlobalView: byId('pane-global-view'),
    paneChannelsView: byId('pane-channels-view'),
    channelsList: byId('channels-list'),
    channelsCount: byId('channels-count'),
    channelTraffic: byId('channel-traffic'),
    filterInput: byId<HTMLInputElement>('filter'),
    filterChips: byId('filter-chips'),
    filterCount: byId('filter-count'),
    globalList: byId('global-list'),
    splitter: byId('splitter'),
    details: document.querySelector('.details') as HTMLElement,
};
