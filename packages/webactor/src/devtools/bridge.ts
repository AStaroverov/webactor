import { type AnyEnvelope, createEnvelope, type EnvelopeTypes } from '../envelope';
import type { Transmitter } from '../types';
import { threadId } from '../utils/thread';
import { isDedicatedWorkerScope, isSharedWorkerScope, isWindowScope, isWorkerLike } from '../worker/detect';
import { DEVTOOLS_ENVELOPE_TYPE, DevtoolsBridgeMessage } from './defs';
import { addSink, devtools } from './recorder';
import type { DevtoolsEvent } from './types';

type AttachData = {
    kind: typeof DevtoolsBridgeMessage.Attach;
    thread: string;
    nodeId: string;
    /** Set when the sender holds a local sink, i.e. it is where events must ultimately arrive. */
    root: boolean;
    port: MessagePort;
};

type RelayMessage =
    | { kind: typeof DevtoolsBridgeMessage.Attached; thread: string; nodeId: string }
    | { kind: typeof DevtoolsBridgeMessage.Events; events: DevtoolsEvent[]; path: string[] };

type PortState = {
    direction: 'out' | 'in';
    detach: VoidFunction;
};

const states = new WeakMap<object, PortState>();

/**
 * One upstream per peer thread. A SharedWorker legitimately reports to every page that connected to
 * it, so this cannot be a single slot; a second port to a thread we already report to is refused,
 * because that pair is what would let two threads relay to each other.
 */
const upstreams = new Map<string, VoidFunction>();

let unloadHooked = false;

/** Closing our out-attach channels makes the peer's relay port fire `close`, so it frees its slot. */
function detachOnUnload(detach: VoidFunction): void {
    if (!isWindowScope(globalThis)) return;
    outAttachments.add(detach);
    if (unloadHooked) return;
    unloadHooked = true;
    globalThis.addEventListener('pagehide', () => {
        for (const dispose of outAttachments) dispose();
        outAttachments.clear();
    });
}

const outAttachments = new Set<VoidFunction>();

export function isRemoteTransmitter(transmitter: object): boolean {
    if (typeof MessagePort !== 'undefined' && transmitter instanceof MessagePort) return true;
    if (isWorkerLike(transmitter)) return true;
    return isDedicatedWorkerScope(transmitter) || isSharedWorkerScope(transmitter);
}

function sendEvents(port: MessagePort, events: DevtoolsEvent[], path: string[]): void {
    port.postMessage({ kind: DevtoolsBridgeMessage.Events, events, path });
}

export function observeRemoteTransmitter(transmitter: Transmitter): void {
    if (!devtools.active) return;
    if (!isRemoteTransmitter(transmitter)) return;
    if (devtools.isExcludedFromBridge(transmitter)) return;
    devtools.register([transmitter], 'port');
    attachToRemote(transmitter);
}

function attachToRemote(transmitter: Transmitter): void {
    if (states.has(transmitter)) return;
    if (typeof MessageChannel === 'undefined') return;

    const localNodeId = devtools.nodeId(transmitter);
    if (localNodeId === undefined) return;

    const channel = new MessageChannel();

    const onMessage = (event: MessageEvent<RelayMessage>) => {
        const message = event.data;
        if (message === null || typeof message !== 'object') return;
        if (message.kind === DevtoolsBridgeMessage.Attached) {
            devtools.crossLink(localNodeId, message.nodeId, message.thread);
            return;
        }
        if (message.kind === DevtoolsBridgeMessage.Events) {
            devtools.ingest(message.events, message.path ?? []);
        }
    };

    channel.port1.addEventListener('message', onMessage);
    channel.port1.start();

    const detach = () => {
        channel.port1.removeEventListener('message', onMessage);
        channel.port1.close();
        states.delete(transmitter);
    };

    states.set(transmitter, { direction: 'out', detach });
    detachOnUnload(detach);

    const envelope = createEnvelope(
        DEVTOOLS_ENVELOPE_TYPE as EnvelopeTypes,
        {
            kind: DevtoolsBridgeMessage.Attach,
            thread: threadId,
            nodeId: localNodeId,
            root: devtools.hasLocalSink(),
            port: channel.port2,
        },
        [channel.port2],
    );

    try {
        (transmitter as { postMessage: (message: unknown, transfer: Transferable[]) => void }).postMessage(envelope, [
            channel.port2,
        ]);
    } catch {
        detach();
    }
}

function acceptAttach(transmitter: object, data: AttachData): void {
    const port = data.port;
    if (port === undefined || typeof port.postMessage !== 'function') return;

    port.start?.();

    const removeSink = addSink(
        (events, path = [threadId]) => {
            if (path.includes(data.thread)) return;
            sendEvents(port, events, path.includes(threadId) ? path : [...path, threadId]);
        },
        { relay: true },
    );

    let detached = false;
    const detach = () => {
        if (detached) return;
        detached = true;
        removeSink();
        port.close();
        states.delete(transmitter);
        if (upstreams.get(data.thread) === detach) upstreams.delete(data.thread);
    };

    // Fires when the peer closes its end or its realm goes away, which is how a closed tab frees its slot.
    port.addEventListener('close', detach);

    states.set(transmitter, { direction: 'in', detach });
    upstreams.set(data.thread, detach);

    const localNodeId = devtools.nodeId(transmitter);
    if (localNodeId !== undefined) {
        port.postMessage({ kind: DevtoolsBridgeMessage.Attached, thread: threadId, nodeId: localNodeId });
        devtools.crossLink(localNodeId, data.nodeId, data.thread);
    }

    const snapshot = devtools.snapshotEvents();
    if (snapshot.length > 0) sendEvents(port, snapshot, [threadId]);
}

export function isBridgeEnvelope(envelope: AnyEnvelope): boolean {
    return (envelope.type as string) === DEVTOOLS_ENVELOPE_TYPE;
}

export function handleBridgeEnvelope(transmitter: object, envelope: AnyEnvelope): void {
    const data = envelope.data as AttachData | null;
    if (data === null || typeof data !== 'object' || data.kind !== DevtoolsBridgeMessage.Attach) return;

    const state = states.get(transmitter);
    if (state !== undefined) {
        // Both ends attached out over the same port, which happens whenever a second page connects to
        // an already-active SharedWorker. The root wins: it is the only end that can deliver anywhere.
        if (state.direction === 'in') return;
        if (!data.root || devtools.hasLocalSink()) return;
        state.detach();
    }

    if (upstreams.has(data.thread)) return;
    if (devtools.hasLocalSink()) return;

    acceptAttach(transmitter, data);
}
