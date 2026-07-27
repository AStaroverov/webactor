import type { EnvelopeTypes } from '../envelope';
import type { ValueOf } from '../types';

export const DevtoolsNodeKind = {
    Actor: 'actor',
    Retranslator: 'retranslator',
    Supervisor: 'supervisor',
    ThreadPort: 'thread-port',
    Port: 'port',
    Unknown: 'unknown',
} as const;
export type DevtoolsNodeKinds = ValueOf<typeof DevtoolsNodeKind>;

export const DevtoolsNodeState = {
    Created: 'created',
    Launched: 'launched',
    Closed: 'closed',
} as const;
export type DevtoolsNodeStates = ValueOf<typeof DevtoolsNodeState>;

export type DevtoolsNode = {
    id: string;
    name: string;
    kind: DevtoolsNodeKinds;
    state: DevtoolsNodeStates;
    thread: string;
    createdAt: number;
    restarts: number;
};

export type DevtoolsLink = {
    id: string;
    source: string;
    target: string;
    thread: string;
    types: string[];
    crossThread: boolean;
    createdAt: number;
    inferred?: boolean;
};

export type DevtoolsMessage = {
    seq: string;
    ts: number;
    source: string;
    target: string;
    thread: string;
    type: EnvelopeTypes | string;
    delivered: boolean;
    route: string | undefined;
    checkpoints: string | undefined;
    bytes: number;
    preview: unknown;
    /** The channelId this hop belongs to, when both its ends live inside a channel. */
    channel?: string;
};

export const DevtoolsChannelSide = {
    Open: 'open',
    Support: 'support',
} as const;
export type DevtoolsChannelSides = ValueOf<typeof DevtoolsChannelSide>;

export const DevtoolsChannelState = {
    Opening: 'opening',
    Open: 'open',
    Closed: 'closed',
    Failed: 'failed',
} as const;
export type DevtoolsChannelStates = ValueOf<typeof DevtoolsChannelState>;

/**
 * One side of one channel. The channelId is the same on both sides — the opener generates it and the
 * supporter reads it back off the envelope's route — so the two halves pair up even across threads.
 */
export type DevtoolsChannel = {
    id: string;
    channelId: string;
    side: DevtoolsChannelSides;
    name: string | undefined;
    thread: string;
    state: DevtoolsChannelStates;
    /** The transmitter the channel was opened through, i.e. the actor that owns it. */
    ownerId: string | undefined;
    /** The node the channel's local ends collapsed into, which is where its traffic is recorded. */
    endpointId: string | undefined;
    createdAt: number;
    closedAt?: number;
    reason?: unknown;
};

export const DevtoolsEventType = {
    Node: 'node',
    NodeClosed: 'node-closed',
    Link: 'link',
    LinkClosed: 'link-closed',
    Message: 'message',
    Restart: 'restart',
    Channel: 'channel',
    ChannelState: 'channel-state',
} as const;
export type DevtoolsEventTypes = ValueOf<typeof DevtoolsEventType>;

export type DevtoolsEvent =
    | { type: typeof DevtoolsEventType.Node; node: DevtoolsNode }
    | { type: typeof DevtoolsEventType.NodeClosed; id: string; ts: number }
    | { type: typeof DevtoolsEventType.Link; link: DevtoolsLink }
    | { type: typeof DevtoolsEventType.LinkClosed; id: string; ts: number }
    | { type: typeof DevtoolsEventType.Message; message: DevtoolsMessage }
    | { type: typeof DevtoolsEventType.Restart; id: string; ts: number; reason: unknown }
    | { type: typeof DevtoolsEventType.Channel; channel: DevtoolsChannel }
    | {
          type: typeof DevtoolsEventType.ChannelState;
          id: string;
          state: DevtoolsChannelStates;
          ts: number;
          reason?: unknown;
      };

export type DevtoolsSnapshot = {
    thread: string;
    nodes: DevtoolsNode[];
    links: DevtoolsLink[];
    messages: DevtoolsMessage[];
    channels: DevtoolsChannel[];
};

export type DevtoolsOptions = {
    maxNodes: number;
    maxLinks: number;
    maxMessages: number;
    maxChannels: number;
    previewDepth: number;
    capturePayload: boolean;
    flushInterval: number;
    maxBatch: number;
};

export type DevtoolsSink = (events: DevtoolsEvent[], path?: string[]) => void;

export type DevtoolsHook = {
    onEvents: DevtoolsSink;
};
