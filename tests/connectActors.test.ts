import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectActors } from '../src/connectActors';
import { createActorFactory } from '../src/createActorFactory';
import { createEnvelopeChannel } from '../src/createEnvelopePort';
import { Actor, ActorContext } from '../src/types';

describe('connectActors', () => {
    let createActorFromFactory: ReturnType<typeof createActorFactory>;

    beforeEach(() => {
        const mockCreateChannel = vi.fn().mockImplementation(() => createEnvelopeChannel());
        createActorFromFactory = createActorFactory({ createChannel: mockCreateChannel });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('function signature and basic behavior', () => {
        it('should be a function', () => {
            expect(typeof connectActors).toBe('function');
        });

        it('should return a disconnect function', () => {
            const actor1 = createActorFromFactory('actor1', vi.fn());
            const actor2 = createActorFromFactory('actor2', vi.fn());

            const disconnect = connectActors(actor1, actor2);

            expect(typeof disconnect).toBe('function');

            disconnect();
            actor1.close();
            actor2.close();
        });
    });

    describe('Actor to Actor connection', () => {
        it('should connect two Actor instances bidirectionally', async () => {
            const actor1Messages: any[] = [];
            const actor2Messages: any[] = [];
            let actor1Context: ActorContext | null = null;
            let actor2Context: ActorContext | null = null;

            const actor1 = createActorFromFactory('actor1', (context: ActorContext) => {
                actor1Context = context;
                context.addEventListener('message', (event) => {
                    actor1Messages.push(event.data);
                });
            });

            const actor2 = createActorFromFactory('actor2', (context: ActorContext) => {
                actor2Context = context;
                context.addEventListener('message', (event) => {
                    actor2Messages.push(event.data);
                });
            });

            actor1.launch();
            actor2.launch();

            const disconnect = connectActors(actor1, actor2);

            const message1 = { type: 'ping', from: 'actor1' };
            const message2 = { type: 'pong', from: 'actor2' };

            // Send messages via context.postMessage (mailboxOut) which should be relayed
            actor1Context!.postMessage(message1);
            actor2Context!.postMessage(message2);

            // Allow messages to propagate
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(actor2Messages).toContainEqual({ type: 'ping', from: 'actor1' });
            expect(actor1Messages).toContainEqual({ type: 'pong', from: 'actor2' });

            disconnect();
            actor1.close();
            actor2.close();
        });

        it('should work with Actor and ActorContext types', async () => {
            let parentContext: ActorContext | null = null;
            let innerActor: Actor | null = null;
            const messages: any[] = [];

            // Создаем актор
            const parentActor = createActorFromFactory('parent', (context: ActorContext) => {
                parentContext = context;

                // Внутри него создаем еще один актор
                innerActor = createActorFromFactory('inner', (innerContext: ActorContext) => {
                    innerContext.addEventListener('message', (event) => {
                        messages.push(event.data);
                    });
                });
                innerActor.launch();
            });

            parentActor.launch();

            // Связываем ActorContext (parentContext) с Actor (innerActor)
            const disconnect = connectActors(parentContext!, innerActor!);

            // Отправляем сообщение через ActorContext и проверяем что оно дошло до Actor
            parentActor!.postMessage({ type: 'test', data: 'hello from context to actor' });

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(messages).toContainEqual({ type: 'test', data: 'hello from context to actor' });

            disconnect();
            parentActor.close();
            innerActor!.close();
        });
    });

    describe('message passing between connected actors', () => {
        it('should relay messages bidirectionally', async () => {
            const actor1Handler = vi.fn();
            const actor2Handler = vi.fn();
            let actor1Context: ActorContext | null = null;
            let actor2Context: ActorContext | null = null;

            const actor1 = createActorFromFactory('actor1', (context: ActorContext) => {
                actor1Context = context;
                context.addEventListener('message', actor1Handler);
            });

            const actor2 = createActorFromFactory('actor2', (context: ActorContext) => {
                actor2Context = context;
                context.addEventListener('message', actor2Handler);
            });

            actor1.launch();
            actor2.launch();

            const disconnect = connectActors(actor1, actor2);

            const message1 = { type: 'test1', payload: 'from actor1' };
            const message2 = { type: 'test2', payload: 'from actor2' };

            // Send messages via context.postMessage (which uses mailboxOut)
            // These should be relayed by connectActorToActor to the other actor's mailboxIn
            actor1Context!.postMessage(message1);
            actor2Context!.postMessage(message2);

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(actor2Handler).toHaveBeenCalledWith(
                expect.objectContaining({ data: message1 })
            );
            expect(actor1Handler).toHaveBeenCalledWith(
                expect.objectContaining({ data: message2 })
            );

            disconnect();
            actor1.close();
            actor2.close();
        });

        it('should handle complex message types', async () => {
            const actor2Handler = vi.fn();
            let actor1Context: ActorContext | null = null;

            const actor1 = createActorFromFactory('actor1', (context: ActorContext) => {
                actor1Context = context;
            });

            const actor2 = createActorFromFactory('actor2', (context: ActorContext) => {
                context.addEventListener('message', actor2Handler);
            });

            actor1.launch();
            actor2.launch();

            const disconnect = connectActors(actor1, actor2);

            const complexMessage = {
                type: 'complex',
                nested: { deep: { value: 42 } },
                array: [1, 2, 3],
                metadata: { timestamp: Date.now() }
            };

            actor1Context!.postMessage(complexMessage);

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(actor2Handler).toHaveBeenCalledWith(
                expect.objectContaining({ data: complexMessage })
            );

            disconnect();
            actor1.close();
            actor2.close();
        });
    });

    describe('connection lifecycle and cleanup', () => {
        it('should stop message relay after disconnect', async () => {
            const actor1Handler = vi.fn();
            const actor2Handler = vi.fn();
            let actor1Context: ActorContext | null = null;

            const actor1 = createActorFromFactory('actor1', (context: ActorContext) => {
                actor1Context = context;
                context.addEventListener('message', actor1Handler);
            });

            const actor2 = createActorFromFactory('actor2', (context: ActorContext) => {
                context.addEventListener('message', actor2Handler);
            });

            actor1.launch();
            actor2.launch();

            const disconnect = connectActors(actor1, actor2);

            // Send message while connected
            actor1Context!.postMessage({ type: 'before-disconnect' });

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(actor2Handler).toHaveBeenCalledTimes(1);

            // Disconnect
            disconnect();

            // Clear previous calls
            actor2Handler.mockClear();

            // Send message after disconnect
            actor1Context!.postMessage({ type: 'after-disconnect' });

            await new Promise(resolve => setTimeout(resolve, 10));

            // Should not receive new messages
            expect(actor2Handler).not.toHaveBeenCalled();

            actor1.close();
            actor2.close();
        });

        it('should handle actor destruction gracefully', async () => {
            const actor1Handler = vi.fn();
            const actor2Handler = vi.fn();

            const actor1 = createActorFromFactory('actor1', (context: ActorContext) => {
                context.addEventListener('message', actor1Handler);
            });

            const actor2 = createActorFromFactory('actor2', (context: ActorContext) => {
                context.addEventListener('message', actor2Handler);
            });

            actor1.launch();
            actor2.launch();

            const disconnect = connectActors(actor1, actor2);

            // close one actor while still connected
            actor1.close();

            // Should not throw error when trying to send message to closeed actor
            expect(() => {
                actor2.postMessage({ type: 'to-closeed-actor' });
            }).not.toThrow();

            disconnect();
            actor2.close();
        });

        it('should handle multiple disconnect calls gracefully', () => {
            const actor1 = createActorFromFactory('actor1', vi.fn());
            const actor2 = createActorFromFactory('actor2', vi.fn());

            actor1.launch();
            actor2.launch();

            const disconnect = connectActors(actor1, actor2);

            expect(() => {
                disconnect();
                disconnect(); // Second call should not throw
                disconnect(); // Third call should not throw
            }).not.toThrow();

            actor1.close();
            actor2.close();
        });
    });

    describe('edge cases and error handling', () => {
        it('should handle same actor connection', async () => {
            const selfHandler = vi.fn();
            let actorContext: ActorContext | null = null;

            const actor = createActorFromFactory('self-actor', (context: ActorContext) => {
                actorContext = context;
                context.addEventListener('message', selfHandler);
            });

            actor.launch();

            const disconnect = connectActors(actor, actor);

            actorContext!.postMessage({ type: 'self-message' });

            await new Promise(resolve => setTimeout(resolve, 10));

            // Should receive the message (self-connection)
            expect(selfHandler).toHaveBeenCalledWith(
                expect.objectContaining({ data: { type: 'self-message' } })
            );

            disconnect();
            actor.close();
        });

        it('should maintain message order', async () => {
            const receivedMessages: any[] = [];
            let actor1Context: ActorContext | null = null;

            const actor1 = createActorFromFactory('actor1', (context: ActorContext) => {
                actor1Context = context;
            });
            const actor2 = createActorFromFactory('actor2', (context: ActorContext) => {
                context.addEventListener('message', (event) => {
                    receivedMessages.push(event.data);
                });
            });

            actor1.launch();
            actor2.launch();

            const disconnect = connectActors(actor1, actor2);

            // Send multiple messages in sequence
            const messages = [
                { type: 'msg1', order: 1 },
                { type: 'msg2', order: 2 },
                { type: 'msg3', order: 3 },
                { type: 'msg4', order: 4 },
                { type: 'msg5', order: 5 }
            ];

            messages.forEach(msg => actor1Context!.postMessage(msg));

            await new Promise(resolve => setTimeout(resolve, 20));

            expect(receivedMessages).toHaveLength(5);
            expect(receivedMessages.map(m => m.order)).toEqual([1, 2, 3, 4, 5]);

            disconnect();
            actor1.close();
            actor2.close();
        });
    });
});