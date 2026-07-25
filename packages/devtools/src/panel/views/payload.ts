type Tagged = { __wa: string } & Record<string, unknown>;

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

function renderValue(key: string | undefined, value: unknown, depth: number): HTMLElement {
    const row = element('div', 'tree-row');
    row.style.paddingLeft = `${depth * 12}px`;

    if (key !== undefined) row.append(element('span', 'tree-key', `${key}: `));

    if (isTagged(value)) {
        const label = taggedLabel(value);
        row.append(element('span', `tree-tag tag-${value.__wa}`, label));
        if (value.__wa === 'Error' && typeof value.stack === 'string') {
            const stack = element('pre', 'tree-stack', value.stack);
            const wrapper = element('div');
            wrapper.append(row, stack);
            return wrapper;
        }
        if (value.__wa === 'Map' && Array.isArray(value.entries)) {
            return withChildren(row, value.entries as [unknown, unknown][], depth, true);
        }
        if (value.__wa === 'Set' && Array.isArray(value.items)) {
            return withChildren(
                row,
                (value.items as unknown[]).map((item, index) => [index, item]),
                depth,
                false,
            );
        }
        return row;
    }

    if (value === null) {
        row.append(element('span', 'tree-null', 'null'));
        return row;
    }

    if (Array.isArray(value)) {
        row.append(element('span', 'tree-meta', `Array(${value.length})`));
        return withChildren(
            row,
            value.map((item, index) => [index, item]),
            depth,
            false,
        );
    }

    if (typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>);
        row.append(element('span', 'tree-meta', `{${entries.length}}`));
        return withChildren(row, entries, depth, false);
    }

    const type = typeof value;
    row.append(element('span', `tree-${type}`, type === 'string' ? `"${String(value)}"` : String(value)));
    return row;
}

function withChildren(
    row: HTMLElement,
    entries: [unknown, unknown][],
    depth: number,
    keyAsValue: boolean,
): HTMLElement {
    const wrapper = element('div', 'tree-group');
    const toggle = element('span', 'tree-toggle', '▾');
    row.prepend(toggle);
    const children = element('div', 'tree-children');

    for (const [key, item] of entries) {
        if (keyAsValue) {
            const pair = element('div', 'tree-pair');
            pair.append(renderValue('key', key, depth + 1), renderValue('value', item, depth + 1));
            children.append(pair);
        } else {
            children.append(renderValue(String(key), item, depth + 1));
        }
    }

    let open = depth < 2;
    const sync = () => {
        children.style.display = open ? '' : 'none';
        toggle.textContent = open ? '▾' : '▸';
    };
    sync();
    row.addEventListener('click', (event) => {
        event.stopPropagation();
        open = !open;
        sync();
    });

    wrapper.append(row, children);
    return wrapper;
}

export function renderPayload(container: HTMLElement, value: unknown): void {
    container.textContent = '';
    if (value === undefined) {
        container.append(element('div', 'tree-empty', 'payload capture is off'));
        return;
    }
    container.append(renderValue(undefined, value, 0));
}
