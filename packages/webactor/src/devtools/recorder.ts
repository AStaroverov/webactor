import type { AnyEnvelope } from '../envelope';
import { threadId } from '../utils/thread';
import { excludeFromBridge, isExcludedFromBridge } from './bridge-exclusions';
import { DEVTOOLS_GLOBAL_KEY, DEVTOOLS_HOOK_KEY } from './defs';
import * as state from './graph-state';
import { declareKind, describe, descriptorOf, displayName, identify, inferKind } from './identity';
import { getOptions, option, setOptions } from './options';
import { createPreview, estimateBytes } from './serialize';
import * as sinks from './sinks';
import {
    type DevtoolsEvent,
    DevtoolsEventType,
    type DevtoolsHook,
    type DevtoolsNode,
    type DevtoolsNodeKinds,
    type DevtoolsNodeStates,
    type DevtoolsOptions,
    type DevtoolsSink,
    type DevtoolsSnapshot,
} from './types';

let sequence = 0;

function record(event: DevtoolsEvent): void {
    state.apply(event);
    sinks.queue(event);
}

function ensureNode(id: string, kind: DevtoolsNodeKinds, name?: string, thread = threadId): DevtoolsNode {
    const existing = state.getNode(id);
    if (existing !== undefined) return existing;
    const node: DevtoolsNode = {
        id,
        name: name ?? displayName(id),
        kind,
        state: 'created',
        thread,
        createdAt: Date.now(),
        restarts: 0,
    };
    record({ type: DevtoolsEventType.Node, node });
    return node;
}

function ensureNodeFor(transmitter: object): DevtoolsNode {
    const descriptor = descriptorOf(transmitter);
    return ensureNode(identify(transmitter), descriptor?.kind ?? inferKind(transmitter), descriptor?.name);
}

function announce(transmitter: object, kind: DevtoolsNodeKinds, name?: string): void {
    const node = ensureNodeFor(transmitter);
    if (node.kind === kind && (name === undefined || node.name === name)) return;
    node.kind = kind;
    if (name !== undefined) node.name = name;
    record({ type: DevtoolsEventType.Node, node });
}

function ensureLink(sourceId: string, targetId: string): void {
    const id = `${sourceId}|${targetId}`;
    if (state.hasLink(id) || state.hasLink(`${targetId}|${sourceId}`)) return;
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
    const remove = sinks.addSink(sink, options);
    (globalThis as Record<string, unknown>)[DEVTOOLS_GLOBAL_KEY] = devtools;
    return remove;
}

export const devtools = {
    get active(): boolean {
        return sinks.isActive();
    },

    hasSinks: sinks.hasSinks,
    hasLocalSink: sinks.hasLocalSink,
    excludeFromBridge,
    isExcludedFromBridge,
    addSink,

    nodeId(transmitter: object): string | undefined {
        return sinks.isActive() ? identify(transmitter) : undefined;
    },

    register(primary: object, alias: object | undefined, kind: DevtoolsNodeKinds, name?: string): void {
        declareKind(primary, kind);
        if (!sinks.isActive()) return;
        describe(primary, alias, kind, name);
        announce(primary, kind, name);
    },

    /**
     * The two ends of one internal channel. Unlike a convenience alias this has to be recorded even
     * while nothing is recording: a worker builds its ports before the page attaches to it, and if the
     * ends did not share a node the graph would fall apart exactly at the thread boundary.
     */
    registerEnds(a: object, b: object, kind: DevtoolsNodeKinds, name?: string): void {
        declareKind(a, kind);
        describe(a, b, kind, name);
        if (!sinks.isActive()) return;
        announce(a, kind, name);
    },

    state(transmitter: object, nodeState: DevtoolsNodeStates): void {
        if (!sinks.isActive()) return;
        const id = identify(transmitter);
        const node = state.getNode(id);
        if (node === undefined || node.state === nodeState) return;
        node.state = nodeState;
        record(
            nodeState === 'closed'
                ? { type: DevtoolsEventType.NodeClosed, id, ts: Date.now() }
                : { type: DevtoolsEventType.Node, node },
        );
    },

    restart(transmitter: object, reason: unknown): void {
        if (!sinks.isActive()) return;
        record({
            type: DevtoolsEventType.Restart,
            id: identify(transmitter),
            ts: Date.now(),
            reason: createPreview(reason, 2),
        });
    },

    link(source: object, target: object, types: string[]): string | undefined {
        if (!sinks.isActive()) return undefined;
        const sourceId = ensureNodeFor(source).id;
        const targetId = ensureNodeFor(target).id;

        const id = `${sourceId}|${targetId}`;
        state.retainLink(id);
        if (state.hasLink(id)) return id;

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

    crossLink(localId: string, remoteId: string, remoteThread: string): void {
        if (!sinks.isActive()) return;
        const [source, target] = localId < remoteId ? [localId, remoteId] : [remoteId, localId];
        const id = `${source}|${target}`;
        if (state.hasLink(id)) return;

        ensureNode(localId, 'port');
        ensureNode(remoteId, 'port', undefined, remoteThread);
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
        if (!sinks.isActive() || id === undefined) return;
        if (state.releaseLink(id) > 0) return;
        if (!state.hasLink(id)) return;
        record({ type: DevtoolsEventType.LinkClosed, id, ts: Date.now() });
    },

    message(source: object, target: object, envelope: AnyEnvelope, delivered: boolean): void {
        if (!sinks.isActive()) return;
        const sourceId = ensureNodeFor(source).id;
        const targetId = ensureNodeFor(target).id;
        ensureLink(sourceId, targetId);
        const preview = option('capturePayload') ? createPreview(envelope.data, option('previewDepth')) : undefined;
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
        const fresh = events.filter((event) => state.isNew(event));
        if (fresh.length === 0) return;
        for (const event of fresh) state.apply(event);
        sinks.flush();
        sinks.deliver(fresh, path);
    },

    snapshot(): DevtoolsSnapshot {
        return state.snapshot(threadId);
    },

    snapshotEvents: state.snapshotEvents,

    setOptions(next: Partial<DevtoolsOptions>): void {
        setOptions(next);
    },

    getOptions,

    clear(): void {
        state.clear();
        sinks.dropQueued();
    },

    flush: sinks.flush,
};

const installedHook = (globalThis as Record<string, unknown>)[DEVTOOLS_HOOK_KEY] as DevtoolsHook | undefined;
if (installedHook !== undefined && typeof installedHook.onEvents === 'function') {
    addSink((events, path) => installedHook.onEvents(events, path));
}
