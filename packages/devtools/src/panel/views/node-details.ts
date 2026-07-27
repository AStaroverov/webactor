import type { Store } from '../store';

export function renderNodeDetails(container: HTMLElement, store: Store, selected: string | undefined): void {
    if (selected === undefined) {
        container.className = 'node-header empty';
        container.textContent = 'select an actor in the graph';
        return;
    }

    const node = store.nodes.get(selected);
    if (node === undefined) {
        container.className = 'node-header empty';
        container.textContent = 'node is gone';
        return;
    }

    const links = [...store.links.values()].filter((link) => link.source === selected || link.target === selected);

    container.className = 'node-header';
    container.textContent = '';

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

    container.append(title, list);
}
