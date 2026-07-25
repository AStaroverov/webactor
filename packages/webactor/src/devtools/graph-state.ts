import { option } from './options';
import {
    type DevtoolsEvent,
    DevtoolsEventType,
    type DevtoolsLink,
    type DevtoolsMessage,
    type DevtoolsNode,
    type DevtoolsSnapshot,
} from './types';

const nodes = new Map<string, DevtoolsNode>();
const links = new Map<string, DevtoolsLink>();
const linkRefs = new Map<string, number>();
const messages: DevtoolsMessage[] = [];

/**
 * Message ids already applied. With several upstreams a batch can reach a thread by two routes, and a
 * snapshot can overlap the batch that follows it; nodes and links are idempotent, messages are not.
 */
const appliedSeq = new Set<string>();

function evictNodes(): void {
    const max = option('maxNodes');
    if (nodes.size <= max) return;
    for (const [id, node] of nodes) {
        if (nodes.size <= max) break;
        if (node.state === 'closed') nodes.delete(id);
    }
}

function evictLinks(): void {
    const max = option('maxLinks');
    if (links.size <= max) return;
    let excess = links.size - max;
    for (const id of links.keys()) {
        if (excess-- <= 0) break;
        links.delete(id);
        linkRefs.delete(id);
    }
}

function trimMessages(): void {
    const max = option('maxMessages');
    if (messages.length > max * 1.25) messages.splice(0, messages.length - max);
}

function forgetOldSeq(): void {
    const max = option('maxMessages') * 2;
    if (appliedSeq.size <= max * 1.25) return;
    let excess = appliedSeq.size - max;
    for (const seq of appliedSeq) {
        if (excess-- <= 0) break;
        appliedSeq.delete(seq);
    }
}

/** True when the event carries new information; a repeated message is dropped rather than duplicated. */
export function isNew(event: DevtoolsEvent): boolean {
    if (event.type !== DevtoolsEventType.Message) return true;
    return !appliedSeq.has(event.message.seq);
}

export function getNode(id: string): DevtoolsNode | undefined {
    return nodes.get(id);
}

export function hasLink(id: string): boolean {
    return links.has(id);
}

export function retainLink(id: string): number {
    const refs = (linkRefs.get(id) ?? 0) + 1;
    linkRefs.set(id, refs);
    return refs;
}

export function releaseLink(id: string): number {
    const refs = (linkRefs.get(id) ?? 1) - 1;
    if (refs > 0) linkRefs.set(id, refs);
    return refs;
}

export function apply(event: DevtoolsEvent): void {
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
            if (appliedSeq.has(event.message.seq)) break;
            appliedSeq.add(event.message.seq);
            forgetOldSeq();
            messages.push(event.message);
            trimMessages();
            break;
        case DevtoolsEventType.Restart: {
            const node = nodes.get(event.id);
            if (node !== undefined) node.restarts += 1;
            break;
        }
    }
}

export function snapshot(thread: string): DevtoolsSnapshot {
    return {
        thread,
        nodes: [...nodes.values()],
        links: [...links.values()],
        messages: [...messages],
    };
}

export function snapshotEvents(): DevtoolsEvent[] {
    const events: DevtoolsEvent[] = [];
    for (const node of nodes.values()) events.push({ type: DevtoolsEventType.Node, node });
    for (const link of links.values()) events.push({ type: DevtoolsEventType.Link, link });
    for (const message of messages) events.push({ type: DevtoolsEventType.Message, message });
    return events;
}

export function clear(): void {
    nodes.clear();
    links.clear();
    linkRefs.clear();
    messages.length = 0;
    appliedSeq.clear();
}
