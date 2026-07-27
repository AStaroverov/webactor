import { afterEach, describe, expect, it } from 'vitest';
import './locks';

import { openChannel } from '../src/channel/openChannelFactory';
import { supportChannel } from '../src/channel/supportChannelFactory';
import { connectActors } from '../src/connectActors';
import { createActor } from '../src/createActor';
import { clearDevtools, type DevtoolsChannel, enableDevtools, getDevtoolsSnapshot } from '../src/devtools';
import type { ActorContext } from '../src/types';
import type { ChannelTransmitter } from '../src/channel/types';

const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

type Party = {
    open: (message: unknown) => Promise<ChannelTransmitter>;
    supported: () => ChannelTransmitter | undefined;
    dispose: VoidFunction;
};

/** A requester and a supporter that echoes anything the channel carries, as an app would wire them. */
function twoActors(): Party {
    let requesterContext: ActorContext | undefined;
    let supported: ChannelTransmitter | undefined;

    const requester = createActor('requester', (context: ActorContext) => {
        requesterContext = context;
    });

    const supporter = createActor('supporter', (context: ActorContext) => {
        context.addEventListener('message', (envelope) => {
            if ((envelope.data as { type?: string })?.type === 'ignore') return;
            supportChannel(context, envelope)
                .then((channel) => {
                    supported = channel;
                    channel.addEventListener('message', (reply) => channel.postMessage(reply.data));
                })
                .catch(() => {});
        });
    });

    const disconnect = connectActors(requester, supporter);
    requester.launch();
    supporter.launch();

    return {
        open: (message) => openChannel(requesterContext!, message),
        supported: () => supported,
        dispose: () => {
            disconnect();
            requester.close();
            supporter.close();
        },
    };
}

function sideOf(channels: DevtoolsChannel[], side: 'open' | 'support'): DevtoolsChannel | undefined {
    return channels.find((channel) => channel.side === side);
}

describe('devtools channels', () => {
    let disable: VoidFunction | undefined;

    afterEach(() => {
        disable?.();
        disable = undefined;
        clearDevtools();
    });

    it('records both sides of a channel under one id and attributes its traffic', async () => {
        disable = enableDevtools();
        const party = twoActors();

        const channel = await party.open('chat');
        await tick();

        const { channels, messages, nodes } = getDevtoolsSnapshot();
        expect(channels).toHaveLength(2);

        const opener = sideOf(channels, 'open')!;
        const supporter = sideOf(channels, 'support')!;
        expect(opener.channelId, 'both sides must agree on the id').toBe(supporter.channelId);
        expect([opener.state, supporter.state]).toEqual(['open', 'open']);
        expect([opener.name, supporter.name]).toEqual(['chat', 'chat']);

        const owner = nodes.find((node) => node.id === opener.ownerId);
        expect(owner?.name, 'the opener side belongs to the actor that opened it').toBe('requester');
        expect(nodes.some((node) => node.id === opener.endpointId)).toBe(true);

        channel.postMessage({ text: 'hello' });
        await tick();

        const attributed = getDevtoolsSnapshot().messages.filter((message) => message.channel === opener.channelId);
        expect(attributed.length, 'traffic through the channel carries its id').toBeGreaterThan(0);
        expect(messages.every((message) => message.channel === undefined || message.channel === opener.channelId)).toBe(
            true,
        );

        channel.close();
        party.dispose();
    });

    it('marks a closed channel with the reason on the side that closed it', async () => {
        disable = enableDevtools();
        const party = twoActors();

        const channel = await party.open('doomed');
        await tick();
        channel.close();
        await tick();

        const channels = getDevtoolsSnapshot().channels;
        expect(sideOf(channels, 'open')!.state).toBe('closed');
        expect(sideOf(channels, 'open')!.closedAt).toBeGreaterThan(0);
        expect(sideOf(channels, 'support')!.state).toBe('closed');
    });

    it('keeps a channel that never opened, marked failed with its error', async () => {
        disable = enableDevtools();

        let context: ActorContext | undefined;
        const lonely = createActor('lonely', (actorContext: ActorContext) => {
            context = actorContext;
        });
        lonely.launch();

        const abort = new AbortController();
        setTimeout(() => abort.abort('nobody answered'), 10);
        await expect(openChannel(context!, 'nowhere', { abortSignal: abort.signal })).rejects.toThrow();

        const channels = getDevtoolsSnapshot().channels;
        expect(channels).toHaveLength(1);
        expect(channels[0].name).toBe('nowhere');
        expect(channels[0].state, 'the request itself was aborted, so the channel never got to close').toBe('failed');
        expect(channels[0].reason).toMatchObject({ __wa: 'Error' });
        expect(channels[0].endpointId, 'no ends ever existed').toBeUndefined();

        lonely.close();
    });

    it('back-fills a channel that was already open when devtools woke up', async () => {
        const party = twoActors();
        const channel = await party.open('early');
        await tick();

        expect(getDevtoolsSnapshot().channels).toHaveLength(0);

        disable = enableDevtools();
        channel.postMessage({ late: true });
        await tick();

        const snapshot = getDevtoolsSnapshot();
        expect(snapshot.channels.length, 'the tag survives, so traffic reveals the channel').toBeGreaterThan(0);
        expect(snapshot.channels[0].name).toBe('early');
        expect(snapshot.channels[0].state).toBe('open');
        expect(snapshot.messages.some((message) => message.channel === snapshot.channels[0].channelId)).toBe(true);

        channel.close();
        party.dispose();
    });
});
