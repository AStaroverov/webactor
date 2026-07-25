import type { DevtoolsEvent, DevtoolsLink, DevtoolsMessage, DevtoolsNode } from 'webactor';

const MAX_MESSAGES = 20000;
const MAX_PER_NODE = 500;
const CLOSED_LINK_TTL = 20000;

export type PanelLink = DevtoolsLink & { closedAt?: number };

export type StoreDelta = {
    graphChanged: boolean;
    messages: DevtoolsMessage[];
};

export class Store {
    readonly nodes = new Map<string, DevtoolsNode>();
    readonly links = new Map<string, PanelLink>();
    readonly messages: DevtoolsMessage[] = [];

    version = 0;

    private readonly perNode = new Map<string, DevtoolsMessage[]>();

    get threads(): string[] {
        const threads = new Set<string>();
        for (const node of this.nodes.values()) threads.add(node.thread);
        return [...threads].sort();
    }

    get liveLinks(): number {
        let live = 0;
        for (const link of this.links.values()) if (link.closedAt === undefined) live += 1;
        return live;
    }

    reset(): void {
        this.nodes.clear();
        this.links.clear();
        this.messages.length = 0;
        this.perNode.clear();
        this.version += 1;
    }

    messagesFor(nodeId: string): DevtoolsMessage[] {
        return this.perNode.get(nodeId) ?? [];
    }

    apply(events: DevtoolsEvent[]): StoreDelta {
        const delta: StoreDelta = { graphChanged: false, messages: [] };

        for (const event of events) {
            switch (event.type) {
                case 'node': {
                    const known = this.nodes.get(event.node.id);
                    this.nodes.set(event.node.id, event.node);
                    if (known === undefined || known.state !== event.node.state) delta.graphChanged = true;
                    break;
                }
                case 'node-closed': {
                    const node = this.nodes.get(event.id);
                    if (node !== undefined) {
                        node.state = 'closed';
                        delta.graphChanged = true;
                    }
                    break;
                }
                case 'link':
                    if (!this.links.has(event.link.id)) delta.graphChanged = true;
                    this.links.set(event.link.id, event.link);
                    break;
                case 'link-closed': {
                    const link = this.links.get(event.id);
                    if (link !== undefined && link.closedAt === undefined) {
                        link.closedAt = event.ts;
                        delta.graphChanged = true;
                    }
                    break;
                }
                case 'restart': {
                    const node = this.nodes.get(event.id);
                    if (node !== undefined) node.restarts += 1;
                    break;
                }
                case 'message':
                    this.pushMessage(event.message);
                    delta.messages.push(event.message);
                    break;
            }
        }

        if (delta.graphChanged) {
            this.pruneClosedLinks();
            this.version += 1;
        }

        return delta;
    }

    private pruneClosedLinks(): void {
        const deadline = Date.now() - CLOSED_LINK_TTL;
        for (const [id, link] of this.links) {
            if (link.closedAt !== undefined && link.closedAt < deadline) this.links.delete(id);
        }
    }

    private pushMessage(message: DevtoolsMessage): void {
        this.messages.push(message);
        if (this.messages.length > MAX_MESSAGES * 1.25) {
            this.messages.splice(0, this.messages.length - MAX_MESSAGES);
        }
        this.index(message.source, message);
        if (message.target !== message.source) this.index(message.target, message);
    }

    private index(nodeId: string, message: DevtoolsMessage): void {
        let bucket = this.perNode.get(nodeId);
        if (bucket === undefined) {
            bucket = [];
            this.perNode.set(nodeId, bucket);
        }
        bucket.push(message);
        if (bucket.length > MAX_PER_NODE * 1.25) bucket.splice(0, bucket.length - MAX_PER_NODE);
    }
}
