import type { DevtoolsMessage } from 'webactor';

export type MessageFilter = {
    /** True when the query selects nothing, i.e. every message matches. */
    readonly empty: boolean;
    matches: (message: DevtoolsMessage, nameOf: (id: string) => string) => boolean;
};

type Term =
    | { kind: 'from'; value: string }
    | { kind: 'to'; value: string }
    | { kind: 'peer'; value: string }
    | { kind: 'type'; value: string }
    | { kind: 'thread'; value: string }
    | { kind: 'dropped' }
    | { kind: 'text'; value: string };

const MATCH_ALL: MessageFilter = { empty: true, matches: () => true };

function parseTerm(token: string): Term | undefined {
    const separator = token.indexOf(':');
    if (separator === -1) {
        return token === 'dropped' ? { kind: 'dropped' } : { kind: 'text', value: token };
    }

    const value = token.slice(separator + 1);
    if (value === '') return undefined;

    switch (token.slice(0, separator)) {
        case 'from':
            return { kind: 'from', value };
        case 'to':
            return { kind: 'to', value };
        case 'peer':
            return { kind: 'peer', value };
        case 'type':
            return { kind: 'type', value };
        case 'thread':
            return { kind: 'thread', value };
        default:
            return { kind: 'text', value: token };
    }
}

function payloadText(message: DevtoolsMessage): string {
    if (message.preview === undefined) return '';
    try {
        return JSON.stringify(message.preview)?.toLowerCase() ?? '';
    } catch {
        return '';
    }
}

/**
 * Parses a watch query into a predicate. Bare words match the payload, the peer names or the envelope
 * type; `from:`, `to:`, `peer:`, `type:` and `thread:` narrow to one field, and `dropped` keeps only
 * envelopes a route mismatch threw away. All terms must match.
 */
export function createMessageFilter(query: string): MessageFilter {
    const terms = query
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .filter((token) => token !== '')
        .map(parseTerm)
        .filter((term): term is Term => term !== undefined);

    if (terms.length === 0) return MATCH_ALL;

    return {
        empty: false,
        matches(message, nameOf) {
            const source = nameOf(message.source).toLowerCase();
            const target = nameOf(message.target).toLowerCase();
            let payload: string | undefined;

            for (const term of terms) {
                switch (term.kind) {
                    case 'from':
                        if (!source.includes(term.value)) return false;
                        break;
                    case 'to':
                        if (!target.includes(term.value)) return false;
                        break;
                    case 'peer':
                        if (!source.includes(term.value) && !target.includes(term.value)) return false;
                        break;
                    case 'type':
                        if (!message.type.toLowerCase().includes(term.value)) return false;
                        break;
                    case 'thread':
                        if (!message.thread.toLowerCase().includes(term.value)) return false;
                        break;
                    case 'dropped':
                        if (message.delivered) return false;
                        break;
                    case 'text': {
                        payload ??= payloadText(message);
                        const hit =
                            payload.includes(term.value) ||
                            source.includes(term.value) ||
                            target.includes(term.value) ||
                            message.type.toLowerCase().includes(term.value);
                        if (!hit) return false;
                        break;
                    }
                }
            }

            return true;
        },
    };
}
