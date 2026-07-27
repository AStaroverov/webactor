import type { DevtoolsChannel, DevtoolsEvent, DevtoolsLink, DevtoolsMessage, DevtoolsNode } from 'webactor';

const MAX_MESSAGES = 20000;
const MAX_PER_NODE = 500;
const CLOSED_LINK_TTL = 20000;
const SETTLED_CHANNEL_TTL = 20000;

export type PanelLink = DevtoolsLink & { closedAt?: number };

/** Both halves of one channel, as the panel shows it: one row, however many threads it spans. */
export type ChannelPair = {
    channelId: string;
    name: string | undefined;
    sides: DevtoolsChannel[];
    openedAt: number;
    settledAt: number | undefined;
};

export type StoreDelta = {
    graphChanged: boolean;
    channelsChanged: boolean;
    messages: DevtoolsMessage[];
};

export class Store {
    readonly nodes = new Map<string, DevtoolsNode>();
    readonly links = new Map<string, PanelLink>();
    readonly messages: DevtoolsMessage[] = [];
    readonly channels = new Map<string, DevtoolsChannel>();

    version = 0;

    private readonly perNode = new Map<string, DevtoolsMessage[]>();
    private readonly perChannel = new Map<string, DevtoolsMessage[]>();

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

    /** One row per channel, live ones first and newest first within each group. */
    get channelPairs(): ChannelPair[] {
        const grouped = new Map<string, DevtoolsChannel[]>();
        for (const side of this.channels.values()) {
            const bucket = grouped.get(side.channelId);
            if (bucket === undefined) grouped.set(side.channelId, [side]);
            else bucket.push(side);
        }

        const pairs: ChannelPair[] = [];
        for (const [channelId, sides] of grouped) {
            const settled = sides.map((side) => side.closedAt).filter((at): at is number => at !== undefined);
            pairs.push({
                channelId,
                name: sides.find((side) => side.name !== undefined)?.name,
                sides,
                openedAt: Math.min(...sides.map((side) => side.createdAt)),
                // Done the moment either half is: the other half simply has not noticed yet.
                settledAt: settled.length === 0 ? undefined : Math.min(...settled),
            });
        }

        return pairs.sort((a, b) => {
            const live = Number(a.settledAt !== undefined) - Number(b.settledAt !== undefined);
            return live !== 0 ? live : b.openedAt - a.openedAt;
        });
    }

    reset(): void {
        this.nodes.clear();
        this.links.clear();
        this.messages.length = 0;
        this.channels.clear();
        this.perNode.clear();
        this.perChannel.clear();
        this.version += 1;
    }

    messagesFor(nodeId: string): DevtoolsMessage[] {
        return this.perNode.get(nodeId) ?? [];
    }

    messagesForChannel(channelId: string): DevtoolsMessage[] {
        return this.perChannel.get(channelId) ?? [];
    }

    apply(events: DevtoolsEvent[]): StoreDelta {
        const delta: StoreDelta = { graphChanged: false, channelsChanged: false, messages: [] };

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
                case 'channel':
                    this.channels.set(event.channel.id, event.channel);
                    delta.channelsChanged = true;
                    break;
                case 'channel-state': {
                    const channel = this.channels.get(event.id);
                    if (channel !== undefined) {
                        channel.state = event.state;
                        if (event.state === 'closed' || event.state === 'failed') {
                            channel.closedAt = event.ts;
                            channel.reason = event.reason;
                        }
                        delta.channelsChanged = true;
                    }
                    break;
                }
            }
        }

        if (delta.graphChanged) {
            this.pruneClosedLinks();
            this.version += 1;
        }
        if (delta.channelsChanged) this.pruneSettledChannels();

        return delta;
    }

    private pruneClosedLinks(): void {
        const deadline = Date.now() - CLOSED_LINK_TTL;
        for (const [id, link] of this.links) {
            if (link.closedAt !== undefined && link.closedAt < deadline) this.links.delete(id);
        }
    }

    private pruneSettledChannels(): void {
        const deadline = Date.now() - SETTLED_CHANNEL_TTL;
        for (const [id, channel] of this.channels) {
            if (channel.closedAt !== undefined && channel.closedAt < deadline) this.channels.delete(id);
        }
    }

    private pushMessage(message: DevtoolsMessage): void {
        this.messages.push(message);
        if (this.messages.length > MAX_MESSAGES * 1.25) {
            this.messages.splice(0, this.messages.length - MAX_MESSAGES);
        }
        this.index(message.source, message);
        if (message.target !== message.source) this.index(message.target, message);

        if (message.channel === undefined) return;
        let bucket = this.perChannel.get(message.channel);
        if (bucket === undefined) {
            bucket = [];
            this.perChannel.set(message.channel, bucket);
        }
        bucket.push(message);
        if (bucket.length > MAX_PER_NODE * 1.25) bucket.splice(0, bucket.length - MAX_PER_NODE);
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
