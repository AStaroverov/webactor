const MAX_ITEMS = 50;
const MAX_KEYS = 50;
const MAX_STRING = 1024;

type Tagged = { __wa: string; [key: string]: unknown };

function tag(kind: string, extra?: Record<string, unknown>): Tagged {
    return { __wa: kind, ...extra };
}

function describeBinary(value: object): Tagged | undefined {
    if (value instanceof ArrayBuffer) return tag('ArrayBuffer', { byteLength: value.byteLength });
    if (typeof SharedArrayBuffer !== 'undefined' && value instanceof SharedArrayBuffer) {
        return tag('SharedArrayBuffer', { byteLength: value.byteLength });
    }
    if (ArrayBuffer.isView(value)) {
        return tag(value.constructor.name, { byteLength: value.byteLength });
    }
    return undefined;
}

function describeOpaque(value: object): Tagged | undefined {
    const name = value.constructor?.name;
    switch (name) {
        case 'MessagePort':
        case 'MessageChannel':
        case 'Blob':
        case 'File':
        case 'ImageBitmap':
        case 'OffscreenCanvas':
        case 'ReadableStream':
        case 'WritableStream':
        case 'TransformStream':
        case 'Worker':
        case 'SharedWorker':
            return tag(name);
        default:
            return undefined;
    }
}

function walk(value: unknown, depth: number, seen: WeakSet<object>): unknown {
    if (value === undefined) return tag('undefined');
    if (value === null) return null;

    switch (typeof value) {
        case 'string':
            return value.length > MAX_STRING
                ? tag('string', { value: value.slice(0, MAX_STRING), length: value.length })
                : value;
        case 'number':
            return Number.isFinite(value) ? value : tag('number', { value: String(value) });
        case 'boolean':
            return value;
        case 'bigint':
            return tag('bigint', { value: String(value) });
        case 'symbol':
            return tag('symbol', { value: String(value) });
        case 'function':
            return tag('function', { name: (value as { name?: string }).name || 'anonymous' });
    }

    const object = value as object;

    if (seen.has(object)) return tag('circular');

    if (object instanceof Error) {
        return tag('Error', { name: object.name, message: object.message, stack: object.stack });
    }
    if (object instanceof Date) return tag('Date', { value: object.toISOString() });
    if (object instanceof RegExp) return tag('RegExp', { value: String(object) });

    const binary = describeBinary(object);
    if (binary) return binary;

    const opaque = describeOpaque(object);
    if (opaque) return opaque;

    if (depth <= 0) {
        return Array.isArray(object)
            ? tag('array', { length: object.length })
            : tag('object', { keys: Object.keys(object).length });
    }

    seen.add(object);
    try {
        if (Array.isArray(object)) {
            const items = object.slice(0, MAX_ITEMS).map((item) => walk(item, depth - 1, seen));
            if (object.length > MAX_ITEMS) items.push(tag('truncated', { rest: object.length - MAX_ITEMS }));
            return items;
        }

        if (object instanceof Map) {
            const entries = [...object.entries()]
                .slice(0, MAX_ITEMS)
                .map(([key, item]) => [walk(key, depth - 1, seen), walk(item, depth - 1, seen)]);
            return tag('Map', { size: object.size, entries });
        }

        if (object instanceof Set) {
            const items = [...object.values()].slice(0, MAX_ITEMS).map((item) => walk(item, depth - 1, seen));
            return tag('Set', { size: object.size, items });
        }

        const result: Record<string, unknown> = {};
        const keys = Object.keys(object);
        for (const key of keys.slice(0, MAX_KEYS)) {
            result[key] = walk((object as Record<string, unknown>)[key], depth - 1, seen);
        }
        if (keys.length > MAX_KEYS) result.__wa_truncated = keys.length - MAX_KEYS;
        return result;
    } catch (error) {
        return tag('unserializable', { reason: String(error) });
    } finally {
        seen.delete(object);
    }
}

export function createPreview(value: unknown, depth: number): unknown {
    try {
        return walk(value, depth, new WeakSet());
    } catch (error) {
        return tag('unserializable', { reason: String(error) });
    }
}

export function estimateBytes(preview: unknown): number {
    try {
        return JSON.stringify(preview)?.length ?? 0;
    } catch {
        return 0;
    }
}
