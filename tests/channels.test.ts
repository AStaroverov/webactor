import './locks';

import { openChannel } from '../src/channel/openChannelFactory';
import { supportChannel } from '../src/channel/supportChannelFactory';
import { connectActorToActor } from '../src/connectActorToActor';
import { createActor } from '../src/createActor';
import { ActorContext } from '../src/types';

describe('Channel System', () => {
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

            const disconnect = connectActorToActor(requesterActor, supporterActor);
            
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
            requesterActor.destroy();
            supporterActor.destroy();
        });

        it('should handle channel closure', async () => {
            let requesterContext: ActorContext<any> | null = null;
            let channelTransmitterPromise: any = null;
            
            const requesterActor = createActor('requester', (context: ActorContext) => {
                requesterContext = context;
            });
            
            const supporterActor = createActor('supporter', (context: ActorContext) => {
                context.addEventListener('message', async (event) => {
                    if (event.data.type === 'request-channel') {
                        channelTransmitterPromise = supportChannel(context, event);
                    }
                });
            });

            const disconnect = connectActorToActor(requesterActor, supporterActor);
            
            requesterActor.launch();
            supporterActor.launch();
            
            const channel = await openChannel(requesterContext!, { type: 'request-channel' });
            const channelTransmitter = await channelTransmitterPromise;
            
            let channelClosed = false;
            let transmitterClosed = false;
            
            channel.addEventListener('error', () => {
                channelClosed = true;
            });
            
            channelTransmitter.addEventListener('error', () => {
                transmitterClosed = true;
            });
            
            // Close channel from one side
            channel.close();
            
            // Allow error events to propagate
            await new Promise(resolve => setTimeout(resolve, 100));
            
            expect(channelClosed).toBe(false);
            expect(transmitterClosed).toBe(true);
            
            disconnect();
            requesterActor.destroy();
            supporterActor.destroy();
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

            const disconnect = connectActorToActor(requesterActor, supporterActor);
            
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
            requesterActor.destroy();
            supporterActor.destroy();
        });
    });
});