type Tagged = { __wa: string } & Record<string, unknown>;

/** Adds a field to the watch set. Paths address the preview structure, which is what the filter walks. */
export type WatchField = (path: string[], value: unknown) => void;

function isTagged(value: unknown): value is Tagged {
    return typeof value === 'object' && value !== null && typeof (value as Tagged).__wa === 'string';
}

function element(tag: string, className?: string, text?: string): HTMLElement {
    const node = document.createElement(tag);
    if (className !== undefined) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function taggedLabel(value: Tagged): string {
    switch (value.__wa) {
        case 'undefined':
            return 'undefined';
        case 'circular':
            return '[circular]';
        case 'string':
            return `"${String(value.value)}…" (${String(value.length)} chars)`;
        case 'bigint':
            return `${String(value.value)}n`;
        case 'number':
        case 'symbol':
        case 'Date':
        case 'RegExp':
            return String(value.value);
        case 'function':
            return `ƒ ${String(value.name)}()`;
        case 'Error':
            return `${String(value.name)}: ${String(value.message)}`;
        case 'truncated':
            return `… ${String(value.rest)} more`;
        case 'array':
            return `Array(${String(value.length)})`;
        case 'object':
            return `Object(${String(value.keys)} keys)`;
        case 'unserializable':
            return `[unserializable] ${String(value.reason)}`;
        default:
            if (typeof value.byteLength === 'number') return `${value.__wa}(${value.byteLength} bytes)`;
            if (typeof value.size === 'number') return `${value.__wa}(${value.size})`;
            return `[${value.__wa}]`;
    }
}

function watchButton(path: string[], value: unknown, onWatch: WatchField): HTMLElement {
    const button = element('button', 'tree-watch', '+');
    button.title = 'watch every envelope where this field holds this value';
    button.addEventListener('click', (event) => {
        event.stopPropagation();
        onWatch(path, value);
    });
    return button;
}

function group(row: HTMLElement, depth: number, children: HTMLElement[]): HTMLElement {
    const wrapper = element('div', 'tree-group');
    const toggle = element('span', 'tree-toggle', '▾');
    row.prepend(toggle);

    const box = element('div', 'tree-children');
    box.append(...children);

    let open = depth < 2;
    const sync = () => {
        box.style.display = open ? '' : 'none';
        toggle.textContent = open ? '▾' : '▸';
    };
    sync();
    row.addEventListener('click', (event) => {
        event.stopPropagation();
        open = !open;
        sync();
    });

    wrapper.append(row, box);
    return wrapper;
}

function renderValue(
    key: string | undefined,
    path: string[],
    value: unknown,
    depth: number,
    onWatch: WatchField | undefined,
): HTMLElement {
    const row = element('div', 'tree-row');
    row.style.paddingLeft = `${depth * 12}px`;

    if (key !== undefined) row.append(element('span', 'tree-key', `${key}: `));

    const child = (label: string, segments: string[], item: unknown) =>
        renderValue(label, [...path, ...segments], item, depth + 1, onWatch);

    const pin = () => {
        if (onWatch !== undefined) row.append(watchButton(path, value, onWatch));
    };

    if (isTagged(value)) {
        row.append(element('span', `tree-tag tag-${value.__wa}`, taggedLabel(value)));
        pin();

        if (value.__wa === 'Error' && typeof value.stack === 'string') {
            const wrapper = element('div');
            wrapper.append(row, element('pre', 'tree-stack', value.stack));
            return wrapper;
        }
        if (value.__wa === 'Map' && Array.isArray(value.entries)) {
            const entries = value.entries as [unknown, unknown][];
            return group(
                row,
                depth,
                entries.map(([mapKey, item], index) => {
                    const pair = element('div', 'tree-pair');
                    pair.append(
                        child('key', ['entries', String(index), '0'], mapKey),
                        child('value', ['entries', String(index), '1'], item),
                    );
                    return pair;
                }),
            );
        }
        if (value.__wa === 'Set' && Array.isArray(value.items)) {
            const items = value.items as unknown[];
            return group(
                row,
                depth,
                items.map((item, index) => child(String(index), ['items', String(index)], item)),
            );
        }
        return row;
    }

    if (value === null) {
        row.append(element('span', 'tree-null', 'null'));
        pin();
        return row;
    }

    if (Array.isArray(value)) {
        row.append(element('span', 'tree-meta', `Array(${value.length})`));
        pin();
        return group(
            row,
            depth,
            value.map((item, index) => child(String(index), [String(index)], item)),
        );
    }

    if (typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>);
        row.append(element('span', 'tree-meta', `{${entries.length}}`));
        pin();
        return group(
            row,
            depth,
            entries.map(([entryKey, item]) => child(entryKey, [entryKey], item)),
        );
    }

    const type = typeof value;
    row.append(element('span', `tree-${type}`, type === 'string' ? `"${String(value)}"` : String(value)));
    pin();
    return row;
}

export function renderPayload(container: HTMLElement, value: unknown, onWatch?: WatchField): void {
    container.textContent = '';
    if (value === undefined) {
        container.append(element('div', 'tree-empty', 'payload capture is off'));
        return;
    }
    container.append(renderValue(undefined, [], value, 0, onWatch));
}
