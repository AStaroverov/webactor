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
    portsInput: byId<HTMLInputElement>('ports'),
    statusLabel: byId('status'),
    countsLabel: byId('counts'),
    nodeHeader: byId('node-header'),
    messagesList: byId('messages'),
    payloadView: byId('payload-view'),
    paneActorButton: byId<HTMLButtonElement>('pane-actor'),
    paneGlobalButton: byId<HTMLButtonElement>('pane-global'),
    paneActorView: byId('pane-actor-view'),
    paneGlobalView: byId('pane-global-view'),
    filterInput: byId<HTMLInputElement>('filter'),
    filterChips: byId('filter-chips'),
    filterCount: byId('filter-count'),
    globalList: byId('global-list'),
    splitter: byId('splitter'),
    details: document.querySelector('.details') as HTMLElement,
};
