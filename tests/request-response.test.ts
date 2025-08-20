import { connectActorToActor } from '../src';
import { createActor } from '../src/createActor';
import { request } from '../src/request/request';
import { response } from '../src/request/response';
import { ActorContext } from '../src/types';

describe('Request/Response System', () => {
    describe('basic functionality', () => {
        it('should complete request/response cycle successfully', async () => {
            let requesterContext: ActorContext<any> | null = null;
            let responderContext: ActorContext<any> | null = null;
            
            // Create requester actor
            const requesterActor = createActor('requester', (context: ActorContext) => {
                requesterContext = context;
            });
            
            // Create responder actor that handles requests
            const responderActor = createActor('responder', (context: ActorContext) => {
                responderContext = context;
                responderContext.addEventListener('message', (event) => {
                    if (event.data.type === 'ping') {
                        response(responderContext!, event, {
                            type: 'pong',
                            originalMessage: event.data,
                        });
                    }
                });
            });

            const disconnect = connectActorToActor(requesterActor, responderActor);

            requesterActor.launch();
            responderActor.launch();
            
            // Make request from requester context to responder context
            const requestMessage = { type: 'ping', payload: 'hello' };    
            const responseEvent = await request(requesterContext!, requestMessage);
            
            // Verify response
            expect(responseEvent.data).toEqual({
                type: 'pong',
                originalMessage: { type: 'ping', payload: 'hello' },
            });
            
            // Verify event has correct origin (request ID)
            expect(responseEvent.origin).toBeDefined();
            expect(typeof responseEvent.origin).toBe('string');
            
            // Cleanup
            disconnect();
            requesterActor.destroy();
            responderActor.destroy();
        });

        it('should handle request with custom ID', async () => {
            let requesterContext: ActorContext<any> | null = null;
            let responderContext: ActorContext<any> | null = null;
            let receivedOrigin: string | null = null;
            
            const requesterActor = createActor('requester', (context: ActorContext) => {
                requesterContext = context;
            });
            
            const responderActor = createActor('responder', (context: ActorContext) => {
                responderContext = context;
                context.addEventListener('message', (event) => {
                    receivedOrigin = event.origin;
                    response(responderContext!, event, { result: 'success' });
                });
            });

            const disconnect = connectActorToActor(requesterActor, responderActor);
            
            requesterActor.launch();
            responderActor.launch();
            
            const customId = 'custom-request-123';
            const responseEvent = await request(requesterContext!, { test: true }, { id: customId });
            
            expect(responseEvent.data).toEqual({ result: 'success' });
            expect(receivedOrigin).toBe(customId);
            expect(responseEvent.origin).toBe(customId);
            
            disconnect();
            requesterActor.destroy();
            responderActor.destroy();
        });
    });

    describe('retry and timeout behavior', () => {
        it('should retry requests on specified interval', async () => {
            let requesterContext: ActorContext<any> | null = null;
            let responderContext: ActorContext<any> | null = null;
            let requestCount = 0;
            
            const requesterActor = createActor('requester', (context: ActorContext) => {
                requesterContext = context;
            });
            
            const responderActor = createActor('responder', (context: ActorContext) => {
                responderContext = context;
                context.addEventListener('message', (event) => {
                    requestCount++;
                    // Only respond after the 3rd retry
                    if (requestCount >= 3) {
                        response(responderContext!, event, { retryCount: requestCount });
                    }
                });
            });

            const disconnect = connectActorToActor(requesterActor, responderActor);
            
            requesterActor.launch();
            responderActor.launch();
            
            const startTime = Date.now();
            const responseEvent = await request(requesterContext!, { test: 'retry' }, { retryDelay: 100 });
            const endTime = Date.now();
            
            expect(responseEvent.data).toEqual({ retryCount: 3 });
            expect(requestCount).toBe(3);
            // Should take at least 200ms for 2 retries with 100ms delay
            expect(endTime - startTime).toBeGreaterThan(180);
            
            disconnect();
            requesterActor.destroy();
            responderActor.destroy();
        });

        it('should handle request timeout with AbortSignal', async () => {
            let requesterContext: ActorContext<any> | null = null;
            
            const requesterActor = createActor('requester', (context: ActorContext) => {
                requesterContext = context;
            });
            
            const responderActor = createActor('responder', (context: ActorContext) => {
                // Responder doesn't respond - simulates timeout
                context.addEventListener('message', () => {
                    // Do nothing - let it timeout
                });
            });

            const disconnect = connectActorToActor(requesterActor, responderActor);
            
            requesterActor.launch();
            responderActor.launch();
            
            const abortController = new AbortController();
            
            // Abort after 100ms
            setTimeout(() => abortController.abort('Request timed out'), 100);
            
            await expect(
                request(requesterContext!, { test: 'timeout' }, { 
                    abortSignal: abortController.signal,
                })
            ).rejects.toThrow('Request timed out');
            
            disconnect();
            requesterActor.destroy();
            responderActor.destroy();
        });
    });

    describe('error handling', () => {
        it('should handle errors in responder', async () => {
            let requesterContext: ActorContext<any> | null = null;
            let responderContext: ActorContext<any> | null = null;
            
            const requesterActor = createActor('requester', (context: ActorContext) => {
                requesterContext = context;
            });
            
            const responderActor = createActor('responder', (context: ActorContext) => {
                responderContext = context;
                context.addEventListener('message', (event) => {
                    // Simulate error in responder
                    const errorEvent = new MessageEvent('error', { 
                        data: new Error('Responder processing failed') 
                    });
                    responderContext!.dispatchEvent(errorEvent);
                });
            });

            const disconnect = connectActorToActor(requesterActor, responderActor);
            
            requesterActor.launch();
            responderActor.launch();
            
            await expect(
                request(requesterContext!, { test: 'error' })
            ).rejects.toThrow('Responder processing failed');
            
            disconnect();
            requesterActor.destroy();
            responderActor.destroy();
        });

        it('should handle messageerror events', async () => {
            let requesterContext: ActorContext<any> | null = null;
            
            const requesterActor = createActor('requester', (context: ActorContext) => {
                requesterContext = context;
            });
            
            const responderActor = createActor('responder', (context: ActorContext) => {
                context.addEventListener('message', (event) => {
                    // Simulate message error
                    const messageErrorEvent = new MessageEvent('messageerror', { 
                        data: new Error('Message parsing failed') 
                    });
                    context.dispatchEvent(messageErrorEvent);
                });
            });

            const disconnect = connectActorToActor(requesterActor, responderActor);
            
            requesterActor.launch();
            responderActor.launch();
            
            await expect(
                request(requesterContext!, { test: 'messageerror' })
            ).rejects.toThrow('Message parsing failed');
            
            disconnect();
            requesterActor.destroy();
            responderActor.destroy();
        });
    });

    describe('complex scenarios', () => {
        it('should handle multiple concurrent requests', async () => {
            let requesterContext: ActorContext<any> | null = null;
            let responderContext: ActorContext<any> | null = null;
            let requestCounter = 0;
            
            const requesterActor = createActor('requester', (context: ActorContext) => {
                requesterContext = context;
            });
            
            const responderActor = createActor('responder', (context: ActorContext) => {
                responderContext = context;
                responderContext.addEventListener('message', (event) => {
                    requestCounter++;
                    response(responderContext!, event, { 
                        requestId: event.data.id,
                        processed: requestCounter 
                    });
                });
            });

            const disconnect = connectActorToActor(requesterActor, responderActor);
            
            requesterActor.launch();
            responderActor.launch();
            
            // Send multiple requests concurrently
            const responses = await Promise.all([
                request<any>(requesterContext!, { id: 1, data: 'request1' }),
                request<any>(requesterContext!, { id: 2, data: 'request2' }),
                request<any>(requesterContext!, { id: 3, data: 'request3' }),
            ]);

            expect(responses).toHaveLength(3);
            expect(requestCounter).toBe(3);
            
            // Each response should contain the original request ID
            responses.forEach((response, index) => {
                expect(response.data.requestId).toBe(index + 1);
                expect(response.data.processed).toBeGreaterThan(0);
            });
            
            disconnect();
            requesterActor.destroy();
            responderActor.destroy();
        });

        it('should handle MessagePort responses', async () => {
            let requesterContext: ActorContext<any> | null = null;
            
            const requesterActor = createActor('requester', (context: ActorContext) => {
                requesterContext = context;
            });
            
            const responderActor = createActor('responder', (context: ActorContext) => {
                context.addEventListener('message', (event) => {
                    // Create a MessageChannel and send one port as response
                    const { port1, port2 } = new MessageChannel();
                    
                    // Set up port2 to send a message
                    port2.postMessage({ channelMessage: 'Hello via channel' });
                    port2.close();
                    
                    response(context, event, port1);
                });
            });

            const disconnect = connectActorToActor(requesterActor, responderActor);
            
            requesterActor.launch();
            responderActor.launch();
            
            const responseEvent = await request(requesterContext!, { needChannel: true });
            
            expect(responseEvent.data).toBeInstanceOf(MessagePort);
            
            // Test that the MessagePort works
            const port = responseEvent.data as MessagePort;
            const channelMessage = await new Promise((resolve) => {
                port.addEventListener('message', (e) => resolve(e.data));
                port.start();
            });
            
            expect(channelMessage).toEqual({ channelMessage: 'Hello via channel' });
            
            disconnect();
            requesterActor.destroy();
            responderActor.destroy();
        });
    });
});