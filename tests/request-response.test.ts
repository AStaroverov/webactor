import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { connectActors } from '../src';
import { createActor } from '../src/createActor';
import { request } from '../src/request/request';
import { response } from '../src/request/response';
import { ActorContext } from '../src/types';
import { getFirstRouteCheckpoint } from '../src/utils/route';

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

            const disconnect = connectActors(requesterActor, responderActor);

            requesterActor.launch();
            responderActor.launch();

            // Make request from requester context to responder context
            const requestMessage = { type: 'ping', payload: 'hello' };
            const responseEnvelope = await request(requesterContext!, requestMessage);

            // Verify response
            expect(responseEnvelope.data).toEqual({
                type: 'pong',
                originalMessage: { type: 'ping', payload: 'hello' },
            });

            // Verify event has correct origin (request ID)
            expect(responseEnvelope.__checkpoints).toBeDefined();
            expect(typeof responseEnvelope.__checkpoints).toBe('string');

            // Cleanup
            disconnect();
            requesterActor.close();
            responderActor.close();
        });

        it('should handle request with custom ID', async () => {
            let requesterContext: ActorContext<any> | null = null;
            let responderContext: ActorContext<any> | null = null;
            let receivedChannelId: string | undefined = undefined;

            const requesterActor = createActor('requester', (context: ActorContext) => {
                requesterContext = context;
            });

            const responderActor = createActor('responder', (context: ActorContext) => {
                responderContext = context;
                context.addEventListener('message', (event) => {
                    receivedChannelId = getFirstRouteCheckpoint(event.__checkpoints!);
                    response(responderContext!, event, { result: 'success' });
                });
            });

            const disconnect = connectActors(requesterActor, responderActor);

            requesterActor.launch();
            responderActor.launch();

            const customId = 'custom-request-123';
            const responseEvent = await request(requesterContext!, { test: true }, { channelId: customId });

            expect(responseEvent.data).toEqual({ result: 'success' });
            expect(receivedChannelId).toBe(customId);
            expect(getFirstRouteCheckpoint(responseEvent.__checkpoints!)).toBe(customId);

            disconnect();
            requesterActor.close();
            responderActor.close();
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

            const disconnect = connectActors(requesterActor, responderActor);

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
            requesterActor.close();
            responderActor.close();
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

            const disconnect = connectActors(requesterActor, responderActor);

            requesterActor.launch();
            responderActor.launch();

            const abortController = new AbortController();

            // Abort after 100ms
            setTimeout(() => abortController.abort('Request timed out'), 100);

            await expect(
                request(
                    requesterContext!,
                    { test: 'timeout' },
                    {
                        abortSignal: abortController.signal,
                    },
                ),
            ).rejects.toThrow('Request timed out');

            disconnect();
            requesterActor.close();
            responderActor.close();
        });

        it('should reject immediately when signal is already aborted', async () => {
            let requesterContext: ActorContext<any> | null = null;
            let responderReceived = 0;

            const requesterActor = createActor('requester', (context: ActorContext) => {
                requesterContext = context;
            });

            const responderActor = createActor('responder', (context: ActorContext) => {
                context.addEventListener('message', (event) => {
                    responderReceived += 1;
                    response(context, event, { type: 'pong' });
                });
            });

            const disconnect = connectActors(requesterActor, responderActor);

            requesterActor.launch();
            responderActor.launch();

            const abortController = new AbortController();
            abortController.abort('aborted before request');

            await expect(
                request(
                    requesterContext!,
                    { test: 'pre-aborted' },
                    {
                        abortSignal: abortController.signal,
                    },
                ),
            ).rejects.toThrow('aborted before request');

            await new Promise((resolve) => setTimeout(resolve, 10));
            expect(responderReceived).toBe(0);

            disconnect();
            requesterActor.close();
            responderActor.close();
        });
    });

    describe('error responses', () => {
        it('should reject when responder replies with an Error', async () => {
            let requesterContext: ActorContext<any> | null = null;

            const requesterActor = createActor('requester', (context: ActorContext) => {
                requesterContext = context;
            });

            const responderActor = createActor('responder', (context: ActorContext) => {
                context.addEventListener('message', (event) => {
                    response(context, event, new Error('processing failed'));
                });
            });

            const disconnect = connectActors(requesterActor, responderActor);

            requesterActor.launch();
            responderActor.launch();

            await expect(request(requesterContext!, { type: 'doomed' })).rejects.toThrow('processing failed');

            disconnect();
            requesterActor.close();
            responderActor.close();
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
                        processed: requestCounter,
                    });
                });
            });

            const disconnect = connectActors(requesterActor, responderActor);

            requesterActor.launch();
            responderActor.launch();

            // Send multiple requests concurrently
            const responses = await Promise.all([
                request(requesterContext!, { id: 1, data: 'request1' }),
                request(requesterContext!, { id: 2, data: 'request2' }),
                request(requesterContext!, { id: 3, data: 'request3' }),
            ]);

            expect(responses).toHaveLength(3);
            expect(requestCounter).toBe(3);

            // Each response should contain the original request ID
            responses.forEach((response, index) => {
                // @ts-ignore
                expect(response.data.requestId).toBe(index + 1);
                // @ts-ignore
                expect(response.data.processed).toBeGreaterThan(0);
            });

            disconnect();
            requesterActor.close();
            responderActor.close();
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

            const disconnect = connectActors(requesterActor, responderActor);

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
            requesterActor.close();
            responderActor.close();
        });
    });
});
