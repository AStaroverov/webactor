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
};

export const DevtoolsEventType = {
    Node: 'node',
    NodeClosed: 'node-closed',
    Link: 'link',
    LinkClosed: 'link-closed',
    Message: 'message',
    Restart: 'restart',
} as const;
export type DevtoolsEventTypes = ValueOf<typeof DevtoolsEventType>;

export type DevtoolsEvent =
    | { type: typeof DevtoolsEventType.Node; node: DevtoolsNode }
    | { type: typeof DevtoolsEventType.NodeClosed; id: string; ts: number }
    | { type: typeof DevtoolsEventType.Link; link: DevtoolsLink }
    | { type: typeof DevtoolsEventType.LinkClosed; id: string; ts: number }
    | { type: typeof DevtoolsEventType.Message; message: DevtoolsMessage }
    | { type: typeof DevtoolsEventType.Restart; id: string; ts: number; reason: unknown };

export type DevtoolsSnapshot = {
    thread: string;
    nodes: DevtoolsNode[];
    links: DevtoolsLink[];
    messages: DevtoolsMessage[];
};

export type DevtoolsOptions = {
    maxNodes: number;
    maxLinks: number;
    maxMessages: number;
    previewDepth: number;
    capturePayload: boolean;
    flushInterval: number;
    maxBatch: number;
};

export type DevtoolsSink = (events: DevtoolsEvent[], path?: string[]) => void;

export type DevtoolsHook = {
    onEvents: DevtoolsSink;
};
