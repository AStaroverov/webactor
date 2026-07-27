import type { DevtoolsMessage } from 'webactor';

const LABEL_LIMIT = 26;
const MISSING = Symbol('missing');

type Expected = { primitive: true; value: string | number | boolean | null } | { primitive: false; json: string };

export type FieldChip = {
    id: string;
    path: string[];
    label: string;
    expected: Expected;
};

/** Key order in a preview follows the source object, so it has to be normalised before comparing. */
function canonical(value: unknown): string {
    if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;

    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`;
}

function valueAt(preview: unknown, path: string[]): unknown | typeof MISSING {
    let current = preview;
    for (const segment of path) {
        if (current === null || typeof current !== 'object') return MISSING;
        if (!(segment in (current as Record<string, unknown>))) return MISSING;
        current = (current as Record<string, unknown>)[segment];
    }
    return current;
}

function clip(text: string): string {
    return text.length > LABEL_LIMIT ? `${text.slice(0, LABEL_LIMIT)}…` : text;
}

function describe(value: unknown): string {
    if (typeof value === 'string') return clip(`"${value}"`);
    if (value === null || typeof value !== 'object') return String(value);
    return clip(canonical(value));
}

export function chipFor(path: string[], value: unknown): FieldChip {
    const json = canonical(value);
    const primitive = value === null || typeof value !== 'object';
    const field = path.length === 0 ? 'payload' : path.join('.');

    return {
        id: `${field}=${json}`,
        path,
        label: `${field} = ${describe(value)}`,
        expected: primitive
            ? { primitive: true, value: value as string | number | boolean | null }
            : { primitive: false, json },
    };
}

function matches(chip: FieldChip, message: DevtoolsMessage): boolean {
    const found = valueAt(message.preview, chip.path);
    if (found === MISSING) return false;

    if (chip.expected.primitive) return found === chip.expected.value;
    if (found === null || typeof found !== 'object') return false;
    return canonical(found) === chip.expected.json;
}

/**
 * The watched entities, combined with OR: a chip is one field of one payload pinned by value. Causality
 * cannot be recovered from the transport, so this is the tool for assembling a family of envelopes by
 * hand and reading it in order.
 */
export class ChipSet {
    private items: FieldChip[] = [];

    get empty(): boolean {
        return this.items.length === 0;
    }

    list(): readonly FieldChip[] {
        return this.items;
    }

    add(path: string[], value: unknown): FieldChip {
        const chip = chipFor(path, value);
        if (!this.items.some((existing) => existing.id === chip.id)) this.items.push(chip);
        return chip;
    }

    remove(id: string): void {
        this.items = this.items.filter((chip) => chip.id !== id);
    }

    clear(): void {
        this.items = [];
    }

    matches(message: DevtoolsMessage): boolean {
        if (this.items.length === 0) return true;
        return this.items.some((chip) => matches(chip, message));
    }

    counts(messages: readonly DevtoolsMessage[]): Map<string, number> {
        const counts = new Map<string, number>();
        for (const chip of this.items) counts.set(chip.id, 0);

        for (const message of messages) {
            for (const chip of this.items) {
                if (matches(chip, message)) counts.set(chip.id, (counts.get(chip.id) ?? 0) + 1);
            }
        }

        return counts;
    }
}
