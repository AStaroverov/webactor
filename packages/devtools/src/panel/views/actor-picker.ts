import type { ActorEntry } from '../actors';

export type ActorPickerInput = {
    container: HTMLElement;
    entries: ActorEntry[];
    scoped: boolean;
    onToggle: (id: string, name: string) => void;
    onClear: () => void;
};

function header(input: ActorPickerInput): HTMLElement {
    const { entries, scoped, onClear } = input;
    const row = document.createElement('div');
    row.className = 'picker-header';

    const label = document.createElement('span');
    const inScope = entries.filter((entry) => entry.inScope).length;
    label.textContent = scoped ? `${inScope} of ${entries.length} actors` : `all ${entries.length} actors`;
    row.append(label);

    if (scoped) {
        const clear = document.createElement('button');
        clear.className = 'picker-clear';
        clear.textContent = 'clear';
        clear.addEventListener('click', onClear);
        row.append(clear);
    }
    return row;
}

function buildRow(entry: ActorEntry, onToggle: ActorPickerInput['onToggle']): HTMLElement {
    const { node, inScope, byPattern } = entry;
    const row = document.createElement('label');
    row.className = `actor-row${node.state === 'closed' ? ' closed' : ''}`;

    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = inScope;
    box.addEventListener('change', () => onToggle(node.id, node.name));

    const name = document.createElement('span');
    name.className = 'actor-name';
    name.textContent = node.name;

    const thread = document.createElement('span');
    thread.className = 'actor-thread';
    thread.textContent = node.thread;

    row.append(box, name, thread);

    if (byPattern) {
        const badge = document.createElement('i');
        badge.className = 'actor-badge';
        badge.textContent = 're';
        badge.title = 'matched by the pattern above';
        row.append(badge);
    }
    return row;
}

export function renderActorPicker(input: ActorPickerInput): void {
    input.container.textContent = '';
    input.container.append(header(input));

    if (input.entries.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-list';
        empty.textContent = 'no actors yet';
        input.container.append(empty);
        return;
    }

    const fragment = document.createDocumentFragment();
    for (const entry of input.entries) fragment.append(buildRow(entry, input.onToggle));
    input.container.append(fragment);
}
