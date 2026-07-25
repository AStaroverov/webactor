import { afterEach, describe, expect, it } from 'vitest';
import { connectActors } from '../src/connectActors';
import { createActor } from '../src/createActor';
import { applyActorSupervisor } from '../src/applyActorSupervisor';
import { createRetranslator } from '../src/createRetranslator';
import {
    clearDevtools,
    enableDevtools,
    flushDevtools,
    getDevtoolsSnapshot,
    isDevtoolsEnabled,
    type DevtoolsEvent,
} from '../src/devtools';
import { addSink, devtools } from '../src/devtools/recorder';
import type { ActorContext } from '../src/types';

const tick = () => new Promise((resolve) => setTimeout(resolve, 10));

function record() {
    const events: DevtoolsEvent[] = [];
    const disable = enableDevtools((batch) => events.push(...batch));
    return { events, disable };
}

describe('devtools recorder', () => {
    let disable: VoidFunction | undefined;

    afterEach(() => {
        disable?.();
        disable = undefined;
        clearDevtools();
    });

    it('is inert until enabled', async () => {
        const a = createActor('inert-a', () => {});
        const b = createActor('inert-b', (context: ActorContext) => {
            context.postMessage({ hello: 1 });
        });
        connectActors(a, b);
        a.launch();
        b.launch();
        await tick();

        expect(isDevtoolsEnabled()).toBe(false);
        const snapshot = getDevtoolsSnapshot();
        expect(snapshot.nodes).toHaveLength(0);
        expect(snapshot.links).toHaveLength(0);
        expect(snapshot.messages).toHaveLength(0);

        a.close();
        b.close();
    });

    it('records nodes, links and messages', async () => {
        const session = record();
        disable = session.disable;

        const a = createActor('graph-a', (context: ActorContext) => {
            context.addEventListener('message', () => {});
        });
        const b = createActor('graph-b', (context: ActorContext) => {
            context.postMessage({ payload: 'from-b' });
        });

        const disconnect = connectActors(a, b);
        a.launch();
        b.launch();
        await tick();
        flushDevtools();

        const snapshot = getDevtoolsSnapshot();
        const names = snapshot.nodes.map((node) => node.name).sort();
        expect(names).toEqual(['graph-a', 'graph-b']);
        expect(snapshot.nodes.every((node) => node.kind === 'actor')).toBe(true);
        expect(snapshot.nodes.every((node) => node.state === 'launched')).toBe(true);
        expect(snapshot.links).toHaveLength(1);

        const nodeById = new Map(snapshot.nodes.map((node) => [node.id, node]));
        const message = snapshot.messages.find((entry) => nodeById.get(entry.source)?.name === 'graph-b');
        expect(message).toBeDefined();
        expect(nodeById.get(message!.target)?.name).toBe('graph-a');
        expect(message!.type).toBe('message');
        expect(message!.delivered).toBe(true);
        expect(message!.preview).toEqual({ payload: 'from-b' });
        expect(message!.checkpoints).toContain('graph-b');

        expect(session.events.some((event) => event.type === 'node')).toBe(true);
        expect(session.events.some((event) => event.type === 'link')).toBe(true);
        expect(session.events.some((event) => event.type === 'message')).toBe(true);

        disconnect();
        flushDevtools();
        expect(getDevtoolsSnapshot().links).toHaveLength(0);

        a.close();
        b.close();
        await tick();
        flushDevtools();
        expect(getDevtoolsSnapshot().nodes.every((node) => node.state === 'closed')).toBe(true);
    });

    it('reports one node per actor regardless of the handle that is connected', async () => {
        const session = record();
        disable = session.disable;

        let inner: ActorContext | undefined;
        const a = createActor('both-handles', (context: ActorContext) => {
            inner = context;
        });
        a.launch();

        const b = createActor('peer', () => {});
        b.launch();
        connectActors(inner!, b);
        await tick();
        flushDevtools();

        const snapshot = getDevtoolsSnapshot();
        expect(snapshot.nodes.filter((node) => node.name === 'both-handles')).toHaveLength(1);

        a.close();
        b.close();
    });

    it('marks undelivered envelopes when a route does not match', async () => {
        const session = record();
        disable = session.disable;

        const a = createActor('route-a', () => {});
        const b = createActor('route-b', (context: ActorContext) => {
            context.postMessage({ type: 'message', data: 'x', __route: 'nowhere/at/all', __checkpoints: undefined });
        });
        connectActors(a, b);
        a.launch();
        b.launch();
        await tick();
        flushDevtools();

        const dropped = getDevtoolsSnapshot().messages.filter((message) => !message.delivered);
        expect(dropped.length).toBeGreaterThan(0);

        a.close();
        b.close();
    });

    it('records retranslator and supervisor kinds with restarts', async () => {
        const session = record();
        disable = session.disable;

        const retranslator = createRetranslator({ name: 'hub' });
        retranslator.launch();

        let attempt = 0;
        const supervised = applyActorSupervisor(
            () =>
                createActor(`child-${++attempt}`, (context: ActorContext) => {
                    if (attempt === 1) context.close('boom');
                }),
            { shouldRetry: (reason) => reason === 'boom' },
        );
        supervised.launch();
        await tick();
        flushDevtools();

        const snapshot = getDevtoolsSnapshot();
        expect(snapshot.nodes.find((node) => node.name === 'hub')?.kind).toBe('retranslator');
        const supervisor = snapshot.nodes.find((node) => node.kind === 'supervisor');
        expect(supervisor).toBeDefined();
        expect(supervisor!.restarts).toBe(1);
        expect(snapshot.nodes.some((node) => node.name === 'child-2')).toBe(true);
        expect(session.events.some((event) => event.type === 'restart')).toBe(true);

        supervised.close();
        retranslator.close();
    });

    it('separates relay sinks from local sinks so a relay never becomes a root', () => {
        expect(devtools.hasLocalSink()).toBe(false);

        const removeRelay = addSink(() => {}, { relay: true });
        expect(devtools.active).toBe(true);
        expect(devtools.hasLocalSink()).toBe(false);

        const removeLocal = addSink(() => {});
        expect(devtools.hasLocalSink()).toBe(true);

        removeLocal();
        expect(devtools.hasLocalSink()).toBe(false);
        removeRelay();
        expect(devtools.active).toBe(false);
    });

    it('passes the relay path to sinks so a batch cannot revisit a thread', () => {
        const seen: (string[] | undefined)[] = [];
        disable = addSink((_events, path) => seen.push(path));

        const actor = createActor('path-probe', () => {});
        actor.launch();
        flushDevtools();

        expect(seen.length).toBeGreaterThan(0);
        expect(seen[0]).toEqual([getDevtoolsSnapshot().thread]);

        devtools.ingest([{ type: 'node-closed', id: 'nope', ts: 1 }], ['other-thread']);
        expect(seen.at(-1)).toEqual(['other-thread']);

        actor.close();
    });

    it('applies a relayed message once even when it arrives twice', () => {
        const seen: DevtoolsEvent[] = [];
        disable = addSink((events) => seen.push(...events));

        const message = {
            seq: 'other-thread:1',
            ts: 1,
            source: 'a<other-thread-1>',
            target: 'b<other-thread-2>',
            thread: 'other-thread',
            type: 'message',
            delivered: true,
            route: undefined,
            checkpoints: undefined,
            bytes: 2,
            preview: { n: 1 },
        };

        devtools.ingest([{ type: 'message', message }], ['other-thread']);
        devtools.ingest([{ type: 'message', message }], ['other-thread', 'third-thread']);

        expect(getDevtoolsSnapshot().messages.filter((entry) => entry.seq === message.seq)).toHaveLength(1);
        expect(seen.filter((event) => event.type === 'message')).toHaveLength(1);
    });

    it('still knows the kind of an actor created before it was enabled', async () => {
        const early = createActor('created-early', (context: ActorContext) => {
            context.addEventListener('message', () => {});
        });
        early.launch();

        const session = record();
        disable = session.disable;

        const peer = createActor('created-late', (context: ActorContext) => {
            context.postMessage({ hi: 1 });
        });
        connectActors(early, peer);
        peer.launch();
        await tick();
        flushDevtools();

        // Kinds are declared even while nothing records, because a worker only activates once its
        // actors already exist. Everything else about a node is derived on demand.
        const snapshot = getDevtoolsSnapshot();
        expect(snapshot.nodes.find((node) => node.name === 'created-early')?.kind).toBe('actor');
        expect(snapshot.nodes.find((node) => node.name === 'created-late')?.kind).toBe('actor');

        early.close();
        peer.close();
    });

    it('remembers transmitters excluded from bridging', () => {
        const port = {};
        expect(devtools.isExcludedFromBridge(port)).toBe(false);
        devtools.excludeFromBridge(port);
        expect(devtools.isExcludedFromBridge(port)).toBe(true);
    });

    it('caps stored messages', async () => {
        const session = record();
        disable = session.disable;

        const a = createActor('cap-a', () => {});
        let post: ActorContext['postMessage'] | undefined;
        const b = createActor('cap-b', (context: ActorContext) => {
            post = context.postMessage;
        });
        connectActors(a, b);
        a.launch();
        b.launch();

        for (let i = 0; i < 60; i++) post!({ i });
        await tick();
        flushDevtools();

        expect(getDevtoolsSnapshot().messages.length).toBe(60);

        a.close();
        b.close();
    });
});
