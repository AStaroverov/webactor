import type { AnyEnvelope } from '../envelope';
import { timeoutProvider } from '../providers';
import type { Transmitter } from '../types';
import { threadId } from '../utils/thread';
import { getTransmitterName } from '../utils/transmitter';
import { DEVTOOLS_GLOBAL_KEY, DEVTOOLS_HOOK_KEY } from './defs';
import { createPreview, estimateBytes } from './serialize';
import {
    type DevtoolsEvent,
    DevtoolsEventType,
    type DevtoolsHook,
    type DevtoolsLink,
    type DevtoolsMessage,
    type DevtoolsNode,
    type DevtoolsNodeKinds,
    type DevtoolsNodeStates,
    type DevtoolsOptions,
    type DevtoolsSink,
    type DevtoolsSnapshot,
} from './types';

const MAX_NODES = 4000;
const MAX_LINKS = 8000;

const options: DevtoolsOptions = {
    maxMessages: 5000,
    previewDepth: 5,
    capturePayload: true,
    flushInterval: 0,
    maxBatch: 400,
};

const nodes = new Map<string, DevtoolsNode>();
const links = new Map<string, DevtoolsLink>();
const linkRefs = new Map<string, number>();
const messages: DevtoolsMessage[] = [];
const identities = new WeakMap<object, string>();
const descriptors = new WeakMap<object, Descriptor>();
const excluded = new WeakSet<object>();
const sinks = new Set<DevtoolsSink>();
const relaySinks = new Set<DevtoolsSink>();

type Descriptor = {
    kind: DevtoolsNodeKinds;
    name: string | undefined;
    aliases: object[];
};

let active = false;
let sequence = 0;
let pending: DevtoolsEvent[] = [];
let flushHandle: number | undefined;

function displayName(id: string): string {
    const index = id.indexOf('<');
    return index === -1 ? id : id.slice(0, index);
}

function identify(transmitter: object): string {
    const known = identities.get(transmitter);
    if (known !== undefined) return known;

    const descriptor = descriptors.get(transmitter);
    const primary = descriptor?.aliases[0] ?? transmitter;
    const id = identities.get(primary) ?? getTransmitterName(primary as Transmitter);

    if (descriptor === undefined) identities.set(transmitter, id);
    else for (const alias of descriptor.aliases) identities.set(alias, id);

    return id;
}

function flush(): void {
    if (flushHandle !== undefined) {
        timeoutProvider.clearTimeout(flushHandle);
        flushHandle = undefined;
    }
    if (pending.length === 0) return;
    const batch = pending;
    pending = [];
    deliver(batch, [threadId]);
}

function deliver(batch: DevtoolsEvent[], path: string[]): void {
    for (const sink of sinks) {
        try {
            sink(batch, path);
        } catch {
            sinks.delete(sink);
            relaySinks.delete(sink);
        }
    }
    active = sinks.size > 0;
}

function emit(event: DevtoolsEvent): void {
    pending.push(event);
    if (pending.length >= options.maxBatch) {
        flush();
        return;
    }
    if (flushHandle === undefined) {
        flushHandle = timeoutProvider.setTimeout(flush, options.flushInterval);
    }
}

function evictNodes(): void {
    if (nodes.size <= MAX_NODES) return;
    for (const [id, node] of nodes) {
        if (nodes.size <= MAX_NODES) break;
        if (node.state === 'closed') nodes.delete(id);
    }
}

function evictLinks(): void {
    if (links.size <= MAX_LINKS) return;
    let excess = links.size - MAX_LINKS;
    for (const id of links.keys()) {
        if (excess-- <= 0) break;
        links.delete(id);
        linkRefs.delete(id);
    }
}

function applyEvent(event: DevtoolsEvent): void {
    switch (event.type) {
        case DevtoolsEventType.Node:
            nodes.set(event.node.id, event.node);
            evictNodes();
            break;
        case DevtoolsEventType.NodeClosed: {
            const node = nodes.get(event.id);
            if (node !== undefined) node.state = 'closed';
            break;
        }
        case DevtoolsEventType.Link:
            links.set(event.link.id, event.link);
            evictLinks();
            break;
        case DevtoolsEventType.LinkClosed:
            links.delete(event.id);
            linkRefs.delete(event.id);
            break;
        case DevtoolsEventType.Message:
            messages.push(event.message);
            if (messages.length > options.maxMessages * 1.25) {
                messages.splice(0, messages.length - options.maxMessages);
            }
            break;
        case DevtoolsEventType.Restart: {
            const node = nodes.get(event.id);
            if (node !== undefined) node.restarts += 1;
            break;
        }
    }
}

function record(event: DevtoolsEvent): void {
    applyEvent(event);
    emit(event);
}

function inferKind(transmitter: object): DevtoolsNodeKinds {
    if (typeof MessagePort !== 'undefined' && transmitter instanceof MessagePort) return 'port';
    return 'unknown';
}

function ensureNode(id: string, kind: DevtoolsNodeKinds, name?: string): DevtoolsNode {
    const existing = nodes.get(id);
    if (existing !== undefined) return existing;
    const node: DevtoolsNode = {
        id,
        name: name ?? displayName(id),
        kind,
        state: 'created',
        thread: threadId,
        createdAt: Date.now(),
        restarts: 0,
    };
    record({ type: DevtoolsEventType.Node, node });
    return node;
}

function ensureNodeFor(transmitter: object): DevtoolsNode {
    const descriptor = descriptors.get(transmitter);
    return ensureNode(identify(transmitter), descriptor?.kind ?? inferKind(transmitter), descriptor?.name);
}

function ensureLink(sourceId: string, targetId: string): void {
    const id = `${sourceId}|${targetId}`;
    if (links.has(id) || links.has(`${targetId}|${sourceId}`)) return;
    record({
        type: DevtoolsEventType.Link,
        link: {
            id,
            source: sourceId,
            target: targetId,
            thread: threadId,
            types: ['message'],
            crossThread: false,
            createdAt: Date.now(),
            inferred: true,
        },
    });
}

export function addSink(sink: DevtoolsSink, options?: { relay?: boolean }): VoidFunction {
    sinks.add(sink);
    if (options?.relay === true) relaySinks.add(sink);
    active = true;
    (globalThis as Record<string, unknown>)[DEVTOOLS_GLOBAL_KEY] = devtools;
    return () => {
        sinks.delete(sink);
        relaySinks.delete(sink);
        active = sinks.size > 0;
    };
}

export const devtools = {
    get active(): boolean {
        return active;
    },

    hasSinks(): boolean {
        return sinks.size > 0;
    },

    hasLocalSink(): boolean {
        return sinks.size > relaySinks.size;
    },

    excludeFromBridge(transmitter: object): void {
        excluded.add(transmitter);
    },

    isExcludedFromBridge(transmitter: object): boolean {
        return excluded.has(transmitter);
    },

    nodeId(transmitter: object): string | undefined {
        return active ? identify(transmitter) : undefined;
    },

    register(aliases: object[], kind: DevtoolsNodeKinds, name?: string): void {
        const descriptor: Descriptor = { kind, name, aliases };
        for (const alias of aliases) descriptors.set(alias, descriptor);
        if (!active) return;

        const node = ensureNodeFor(aliases[0]);
        if (node.kind === kind && (name === undefined || node.name === name)) return;
        node.kind = kind;
        if (name !== undefined) node.name = name;
        record({ type: DevtoolsEventType.Node, node });
    },

    state(transmitter: object, state: DevtoolsNodeStates): void {
        if (!active) return;
        const id = identify(transmitter);
        const node = nodes.get(id);
        if (node === undefined || node.state === state) return;
        node.state = state;
        record(
            state === 'closed'
                ? { type: DevtoolsEventType.NodeClosed, id, ts: Date.now() }
                : { type: DevtoolsEventType.Node, node },
        );
    },

    restart(transmitter: object, reason: unknown): void {
        if (!active) return;
        record({
            type: DevtoolsEventType.Restart,
            id: identify(transmitter),
            ts: Date.now(),
            reason: createPreview(reason, 2),
        });
    },

    link(source: object, target: object, types: string[]): string | undefined {
        if (!active) return undefined;
        const sourceId = ensureNodeFor(source).id;
        const targetId = ensureNodeFor(target).id;

        const id = `${sourceId}|${targetId}`;
        linkRefs.set(id, (linkRefs.get(id) ?? 0) + 1);
        if (links.has(id)) return id;

        record({
            type: DevtoolsEventType.Link,
            link: {
                id,
                source: sourceId,
                target: targetId,
                thread: threadId,
                types,
                crossThread: false,
                createdAt: Date.now(),
            },
        });
        return id;
    },

    crossLink(localId: string, remoteId: string): void {
        if (!active) return;
        const [source, target] = localId < remoteId ? [localId, remoteId] : [remoteId, localId];
        const id = `${source}|${target}`;
        if (links.has(id)) return;
        ensureNode(source, 'port');
        ensureNode(target, 'port');
        record({
            type: DevtoolsEventType.Link,
            link: {
                id,
                source,
                target,
                thread: threadId,
                types: ['message'],
                crossThread: true,
                createdAt: Date.now(),
            },
        });
    },

    unlink(id: string | undefined): void {
        if (!active || id === undefined) return;
        const refs = (linkRefs.get(id) ?? 1) - 1;
        if (refs > 0) {
            linkRefs.set(id, refs);
            return;
        }
        if (!links.has(id)) return;
        record({ type: DevtoolsEventType.LinkClosed, id, ts: Date.now() });
    },

    message(source: object, target: object, envelope: AnyEnvelope, delivered: boolean): void {
        if (!active) return;
        const sourceId = ensureNodeFor(source).id;
        const targetId = ensureNodeFor(target).id;
        ensureLink(sourceId, targetId);
        const preview = options.capturePayload ? createPreview(envelope.data, options.previewDepth) : undefined;
        record({
            type: DevtoolsEventType.Message,
            message: {
                seq: `${threadId}:${++sequence}`,
                ts: Date.now(),
                source: sourceId,
                target: targetId,
                thread: threadId,
                type: envelope.type,
                delivered,
                route: envelope.__route,
                checkpoints: envelope.__checkpoints,
                bytes: estimateBytes(preview),
                preview,
            },
        });
    },

    ingest(events: DevtoolsEvent[], path: string[] = []): void {
        for (const event of events) applyEvent(event);
        flush();
        deliver(events, path);
    },

    snapshot(): DevtoolsSnapshot {
        return {
            thread: threadId,
            nodes: [...nodes.values()],
            links: [...links.values()],
            messages: [...messages],
        };
    },

    snapshotEvents(): DevtoolsEvent[] {
        const events: DevtoolsEvent[] = [];
        for (const node of nodes.values()) events.push({ type: DevtoolsEventType.Node, node });
        for (const link of links.values()) events.push({ type: DevtoolsEventType.Link, link });
        for (const message of messages) events.push({ type: DevtoolsEventType.Message, message });
        return events;
    },

    setOptions(next: Partial<DevtoolsOptions>): void {
        Object.assign(options, next);
    },

    getOptions(): DevtoolsOptions {
        return { ...options };
    },

    clear(): void {
        nodes.clear();
        links.clear();
        linkRefs.clear();
        messages.length = 0;
        pending = [];
    },

    flush,
    addSink,
};

const installedHook = (globalThis as Record<string, unknown>)[DEVTOOLS_HOOK_KEY] as DevtoolsHook | undefined;
if (installedHook !== undefined && typeof installedHook.onEvents === 'function') {
    addSink((events) => installedHook.onEvents(events));
}
