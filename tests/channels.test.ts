import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import './locks';

import { openChannel } from '../src/channel/openChannelFactory';
import { supportChannel } from '../src/channel/supportChannelFactory';
import { connectActors } from '../src/connectActors';
import { createActor } from '../src/createActor';
import { ActorContext } from '../src/types';
import { restoreMessageChannel, setupMessageChannelMock } from './message-channel-mock';

const testEnvironments = [
    { name: 'Native MessageChannel', setup: () => { }, teardown: () => { } },
    {
        name: 'Sync MessageChannel Mock',
        setup: setupMessageChannelMock,
        teardown: restoreMessageChannel
    }
];

describe.each(testEnvironments)('Channel System - $name', ({ setup, teardown }) => {
    beforeEach(setup);
    afterEach(teardown);

    describe('basic channel functionality', () => {
        it('should establish channel connection between two actors', async () => {
            let requesterContext: ActorContext<any> | null = null;
            let supporterContext: ActorContext<any> | null = null;
            let channelTransmitterPromise: any = null;

            // Create requester actor
            const requesterActor = createActor('requester', (context: ActorContext) => {
                requesterContext = context;
            });

            // Create supporter actor that handles channel requests
            const supporterActor = createActor('supporter', (context: ActorContext) => {
                supporterContext = context;
                context.addEventListener('message', async (event) => {
                    if (event.data.type === 'request-channel') {
                        // Support the channel request
                        channelTransmitterPromise = supportChannel(context, event);
                    }
                });
            });

            const disconnect = connectActors(requesterActor, supporterActor);

            requesterActor.launch();
            supporterActor.launch();

            // Request channel from requester side
            const channelMessage = { type: 'request-channel', payload: 'need channel' };
            const channel = await openChannel(requesterContext!, channelMessage);
            const channelTransmitter = await channelTransmitterPromise;

            // Verify both sides have the channel
            expect(channel).toBeDefined();
            expect(channelTransmitterPromise).toBeDefined();

            // Verify channel has required methods
            expect(typeof channel.postMessage).toBe('function');
            expect(typeof channel.addEventListener).toBe('function');
            expect(typeof channel.removeEventListener).toBe('function');
            expect(typeof channel.close).toBe('function');

            expect(typeof channelTransmitter.postMessage).toBe('function');
            expect(typeof channelTransmitter.addEventListener).toBe('function');
            expect(typeof channelTransmitter.removeEventListener).toBe('function');
            expect(typeof channelTransmitter.close).toBe('function');

            // Test direct communication through channel
            const messagesFromSupporter: any[] = [];
            const messagesFromRequester: any[] = [];

            channel.addEventListener('message', (event) => {
                messagesFromSupporter.push(event.data);
            });

            channelTransmitter.addEventListener('message', (event) => {
                messagesFromRequester.push(event.data);
            });

            // Send messages through the channel (bypassing the main actor communication)
            channel.postMessage({ from: 'requester', message: 'Hello supporter!' });
            channelTransmitter.postMessage({ from: 'supporter', message: 'Hello requester!' });

            // Allow messages to propagate
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(messagesFromSupporter).toContainEqual({ from: 'supporter', message: 'Hello requester!' });
            expect(messagesFromRequester).toContainEqual({ from: 'requester', message: 'Hello supporter!' });

            // Cleanup
            channel.close();
            channelTransmitter.close();
            disconnect();
            requesterActor.close();
            supporterActor.close();
        });

        it('should handle channel closure', async () => {
            let requesterContext: ActorContext<any> | null = null;
            let channelTransmitterPromise: any = null;

            const requesterActor = createActor('requester', (context: ActorContext) => {
                requesterContext = context;
            });

            const supporterActor = createActor('supporter', (context: ActorContext) => {
                context.addEventListener('message', (event) => {
                    // @ts-ignore
                    if (event.data.type === 'request-channel') {
                        channelTransmitterPromise = supportChannel(context, event);
                    }
                });
            });

            const disconnect = connectActors(requesterActor, supporterActor);

            requesterActor.launch();
            supporterActor.launch();

            const channel = await openChannel(requesterContext!, { type: 'request-channel' });
            const channelTransmitter = await channelTransmitterPromise;

            let channelClosed = false;
            let transmitterClosed = false;

            channel.addEventListener('close', () => {
                channelClosed = true;
            });

            channelTransmitter.addEventListener('close', () => {
                transmitterClosed = true;
            });

            // Close channel from one side
            channel.close();

            // Allow error events to propagate
            await new Promise(resolve => setTimeout(resolve, 100));

            expect(channelClosed).toBe(true);
            expect(transmitterClosed).toBe(true);

            disconnect();
            requesterActor.close();
            supporterActor.close();
        });

        it('should isolate channel communication from main actor messages', async () => {
            let requesterContext: ActorContext<any> | null = null;
            let supporterContext: ActorContext<any> | null = null;
            let channelTransmitter: any = null;

            const mainActorMessages: any[] = [];
            const channelMessages: any[] = [];

            const requesterActor = createActor('requester', (context: ActorContext) => {
                requesterContext = context;
                context.addEventListener('message', (event) => {
                    mainActorMessages.push({ actor: 'requester', data: event.data });
                });
            });

            const supporterActor = createActor('supporter', (context: ActorContext) => {
                supporterContext = context;
                context.addEventListener('message', async (event) => {
                    mainActorMessages.push({ actor: 'supporter', data: event.data });

                    if (event.data.type === 'request-channel') {
                        channelTransmitter = await supportChannel(context, event);

                        channelTransmitter.addEventListener('message', (channelEvent: any) => {
                            channelMessages.push({ from: 'supporter-channel', data: channelEvent.data });
                        });
                    }
                });
            });

            const disconnect = connectActors(requesterActor, supporterActor);

            requesterActor.launch();
            supporterActor.launch();

            const channel = await openChannel(requesterContext!, { type: 'request-channel' });

            channel.addEventListener('message', (event) => {
                channelMessages.push({ from: 'requester-channel', data: event.data });
            });

            // Send message through main actor system
            requesterContext!.postMessage({ type: 'main-message', content: 'via actor' });

            // Send message through channel (should be isolated)
            channel.postMessage({ type: 'channel-message', content: 'via channel' });

            await new Promise(resolve => setTimeout(resolve, 10));

            // Main actor should receive the main message
            expect(mainActorMessages).toContainEqual({
                actor: 'supporter',
                data: { type: 'main-message', content: 'via actor' }
            });

            // Channel should receive the channel message
            expect(channelMessages).toContainEqual({
                from: 'supporter-channel',
                data: { type: 'channel-message', content: 'via channel' }
            });

            // Main actor should NOT receive the channel message
            expect(mainActorMessages.find(msg =>
                msg.data.type === 'channel-message'
            )).toBeUndefined();

            // Channel should NOT receive the main message
            expect(channelMessages.find(msg =>
                msg.data.type === 'main-message'
            )).toBeUndefined();

            channel.close();
            channelTransmitter.close();
            disconnect();
            requesterActor.close();
            supporterActor.close();
        });

        it('should prevent channel message leakage to third party actors', async () => {
            let actor1Context: ActorContext<any> | null = null;
            let actor2Context: ActorContext<any> | null = null;
            let actor3Context: ActorContext<any> | null = null;
            let channelTransmitterPromise: any = null;

            const actor1Messages: any[] = [];
            const actor2Messages: any[] = [];
            const actor3Messages: any[] = [];

            // Create three actors
            const actor1 = createActor('actor1', (context: ActorContext) => {
                actor1Context = context;
                context.addEventListener('message', (event) => {
                    actor1Messages.push({ source: 'actor1-main', data: event.data });
                });
            });

            const actor2 = createActor('actor2', (context: ActorContext) => {
                actor2Context = context;
                context.addEventListener('message', async (event) => {
                    actor2Messages.push({ source: 'actor2-main', data: event.data });

                    if (event.data.type === 'request-channel') {
                        channelTransmitterPromise = supportChannel(context, event);
                    }
                });
            });

            const actor3 = createActor('actor3', (context: ActorContext) => {
                actor3Context = context;
                context.addEventListener('message', (event) => {
                    actor3Messages.push({ source: 'actor3-main', data: event.data });
                });
            });

            // Connect all actors to each other (full mesh)
            const disconnect12 = connectActors(actor1, actor2);
            const disconnect13 = connectActors(actor1, actor3);
            const disconnect23 = connectActors(actor2, actor3);

            actor1.launch();
            actor2.launch();
            actor3.launch();

            // Establish channel only between actor1 and actor2
            const channel = await openChannel(actor1Context!, { type: 'request-channel' });
            const channelTransmitter = await channelTransmitterPromise;

            // Set up channel message listeners
            const channelMessagesAtActor1: any[] = [];
            const channelMessagesAtActor2: any[] = [];

            channel.addEventListener('message', (event) => {
                channelMessagesAtActor1.push({ source: 'actor1-channel', data: event.data });
            });

            channelTransmitter.addEventListener('message', (event) => {
                channelMessagesAtActor2.push({ source: 'actor2-channel', data: event.data });
            });

            // Send regular messages through main actor system
            actor1Context!.postMessage({ type: 'broadcast', from: 'actor1', message: 'Hello everyone!' });
            actor3Context!.postMessage({ type: 'broadcast', from: 'actor3', message: 'Hi from actor3!' });

            // Send messages through the private channel (actor1 <-> actor2 only)
            channel.postMessage({ type: 'private', from: 'actor1', secret: 'Secret message from 1 to 2' });
            channelTransmitter.postMessage({ type: 'private', from: 'actor2', secret: 'Secret response from 2 to 1' });

            await new Promise(resolve => setTimeout(resolve, 50));

            // Verify broadcast messages reached all connected actors
            expect(actor2Messages).toContainEqual({ source: 'actor2-main', data: { type: 'broadcast', from: 'actor1', message: 'Hello everyone!' } });
            expect(actor3Messages).toContainEqual({ source: 'actor3-main', data: { type: 'broadcast', from: 'actor1', message: 'Hello everyone!' } });
            expect(actor1Messages).toContainEqual({ source: 'actor1-main', data: { type: 'broadcast', from: 'actor3', message: 'Hi from actor3!' } });
            expect(actor2Messages).toContainEqual({ source: 'actor2-main', data: { type: 'broadcast', from: 'actor3', message: 'Hi from actor3!' } });

            // Verify channel messages only reached the channel participants
            expect(channelMessagesAtActor1).toContainEqual({ source: 'actor1-channel', data: { type: 'private', from: 'actor2', secret: 'Secret response from 2 to 1' } });
            expect(channelMessagesAtActor2).toContainEqual({ source: 'actor2-channel', data: { type: 'private', from: 'actor1', secret: 'Secret message from 1 to 2' } });

            // Verify channel messages DID NOT leak to actor3's main message system
            expect(actor3Messages.find(msg => msg.data.type === 'private')).toBeUndefined();

            // Verify channel messages DID NOT leak to actor1/actor2's main message systems
            expect(actor1Messages.find(msg => msg.data.type === 'private')).toBeUndefined();
            expect(actor2Messages.find(msg => msg.data.type === 'private')).toBeUndefined();

            // Verify main broadcast messages DID NOT leak to the channel
            expect(channelMessagesAtActor1.find(msg => msg.data.type === 'broadcast')).toBeUndefined();
            expect(channelMessagesAtActor2.find(msg => msg.data.type === 'broadcast')).toBeUndefined();

            // Cleanup
            channel.close();
            channelTransmitter.close();
            disconnect12();
            disconnect13();
            disconnect23();
            actor1.close();
            actor2.close();
            actor3.close();
        });

        it('should handle multiple independent channels between different actor pairs', async () => {
            let actor1Context: ActorContext<any> | null = null;
            let actor2Context: ActorContext<any> | null = null;
            let actor3Context: ActorContext<any> | null = null;
            let actor4Context: ActorContext<any> | null = null;

            let channel12TransmitterPromise: any = null;
            let channel34TransmitterPromise: any = null;

            // Create four actors
            const actor1 = createActor('actor1', (context: ActorContext) => { actor1Context = context; });
            const actor2 = createActor('actor2', (context: ActorContext) => {
                actor2Context = context;
                context.addEventListener('message', async (event) => {
                    if (event.data.channelId === '1-2') {
                        channel12TransmitterPromise = supportChannel(context, event);
                    }
                });
            });
            const actor3 = createActor('actor3', (context: ActorContext) => { actor3Context = context; });
            const actor4 = createActor('actor4', (context: ActorContext) => {
                actor4Context = context;
                context.addEventListener('message', async (event) => {
                    if (event.data.channelId === '3-4') {
                        channel34TransmitterPromise = supportChannel(context, event);
                    }
                });
            });

            // Connect actors to enable channel requests
            const disconnect12 = connectActors(actor1, actor2);
            const disconnect34 = connectActors(actor3, actor4);

            actor1.launch();
            actor2.launch();
            actor3.launch();
            actor4.launch();

            // Establish two independent channels: 1<->2 and 3<->4
            const channel12 = await openChannel(actor1Context!, { type: 'request-channel', channelId: '1-2' });
            const channel34 = await openChannel(actor3Context!, { type: 'request-channel', channelId: '3-4' });

            const channel12Transmitter = await channel12TransmitterPromise;
            const channel34Transmitter = await channel34TransmitterPromise;

            // Set up message collectors
            const messages12: any[] = [];
            const messages34: any[] = [];

            channel12.addEventListener('message', (event) => {
                messages12.push({ from: 'actor1-channel', data: event.data });
            });
            channel12Transmitter.addEventListener('message', (event) => {
                messages12.push({ from: 'actor2-channel', data: event.data });
            });

            channel34.addEventListener('message', (event) => {
                messages34.push({ from: 'actor3-channel', data: event.data });
            });
            channel34Transmitter.addEventListener('message', (event) => {
                messages34.push({ from: 'actor4-channel', data: event.data });
            });

            // Send messages through both channels
            channel12.postMessage({ channel: '1-2', message: 'Hello from 1 to 2' });
            channel12Transmitter.postMessage({ channel: '1-2', message: 'Hello from 2 to 1' });

            channel34.postMessage({ channel: '3-4', message: 'Hello from 3 to 4' });
            channel34Transmitter.postMessage({ channel: '3-4', message: 'Hello from 4 to 3' });

            await new Promise(resolve => setTimeout(resolve, 20));

            // Verify each channel only receives its own messages
            expect(messages12).toHaveLength(2);
            expect(messages12).toContainEqual({ from: 'actor1-channel', data: { channel: '1-2', message: 'Hello from 2 to 1' } });
            expect(messages12).toContainEqual({ from: 'actor2-channel', data: { channel: '1-2', message: 'Hello from 1 to 2' } });

            expect(messages34).toHaveLength(2);
            expect(messages34).toContainEqual({ from: 'actor3-channel', data: { channel: '3-4', message: 'Hello from 4 to 3' } });
            expect(messages34).toContainEqual({ from: 'actor4-channel', data: { channel: '3-4', message: 'Hello from 3 to 4' } });

            // Verify no cross-channel message leakage
            expect(messages12.find(msg => msg.data.channel === '3-4')).toBeUndefined();
            expect(messages34.find(msg => msg.data.channel === '1-2')).toBeUndefined();

            // Cleanup
            channel12.close();
            channel12Transmitter.close();
            channel34.close();
            channel34Transmitter.close();
            disconnect12();
            disconnect34();
            actor1.close();
            actor2.close();
            actor3.close();
            actor4.close();
        });
    });
});