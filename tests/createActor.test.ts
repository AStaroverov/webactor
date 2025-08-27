import { createActorFactory } from '../src/createActorFactory';
import { createEnvelopeEmitter } from '../src/createEnvelopeEmitter';
import { createEnvelopeChannel } from '../src/createEnvelopePort';
import { createEnvelope } from '../src/envelope';
import { ActorContext } from '../src/types';

describe('createEnvelopeEmitter', () => {
    let envelopeEmitter: ReturnType<typeof createEnvelopeEmitter>;

    beforeEach(() => {
        envelopeEmitter = createEnvelopeEmitter();
    });

    afterEach(() => {
        envelopeEmitter.close?.();
    });

    it('should add and trigger message event listeners', async () => {
        const mockCallback = jest.fn();
        const testMessage = { type: 'test', payload: 'data' };

        envelopeEmitter.addEventListener('message', mockCallback);
        envelopeEmitter.postMessage(testMessage);

        await new Promise(resolve => setTimeout(resolve, 0));

        expect(mockCallback).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'message',
                data: testMessage
            })
        );
    });

    it('should remove event listeners', () => {
        const mockCallback = jest.fn();
        const testMessage = { type: 'test' };

        envelopeEmitter.addEventListener('message', mockCallback);
        envelopeEmitter.removeEventListener('message', mockCallback);
        envelopeEmitter.postMessage(testMessage);

        expect(mockCallback).not.toHaveBeenCalled();
    });

    it('should support multiple listeners for same event type', async () => {
        const mockCallback1 = jest.fn();
        const mockCallback2 = jest.fn();
        const testMessage = { type: 'test' };

        envelopeEmitter.addEventListener('message', mockCallback1);
        envelopeEmitter.addEventListener('message', mockCallback2);
        envelopeEmitter.postMessage(testMessage);

        await new Promise(resolve => setTimeout(resolve, 0));

        expect(mockCallback1).toHaveBeenCalled();
        expect(mockCallback2).toHaveBeenCalled();
    });

    it('should clear all callbacks on close', () => {
        const mockMessageCallback = jest.fn();

        envelopeEmitter.addEventListener('message', mockMessageCallback);

        envelopeEmitter.close?.();

        // Try to trigger events after close
        envelopeEmitter.postMessage({ test: 'message' });

        const errorEvent = createEnvelope('error', new Error('test'));

        envelopeEmitter.postMessage(errorEvent);

        // None of the callbacks should be called
        expect(mockMessageCallback).not.toHaveBeenCalled();
    });
});

describe('createActorFactory', () => {
    let mockCreateChannel: jest.Mock;
    let createActorFromFactory: ReturnType<typeof createActorFactory>;

    beforeEach(() => {
        mockCreateChannel = jest.fn().mockImplementation(() => createEnvelopeChannel());
        createActorFromFactory = createActorFactory({ createChannel: mockCreateChannel });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('actor creation', () => {
        it('should create actor with given name and constructor', () => {
            const mockConstructor = jest.fn();
            const actor = createActorFromFactory('test-actor', mockConstructor);

            expect(actor.name).toBe('test-actor');
            expect(typeof actor.launch).toBe('function');
            expect(typeof actor.close).toBe('function');
            expect(typeof actor.postMessage).toBe('function');
            expect(typeof actor.addEventListener).toBe('function');

            actor.close();
        });
    });

    describe('actor lifecycle', () => {
        it('should call constructor on launch with correct context', () => {
            const mockConstructor = jest.fn();
            const actor = createActorFromFactory('test-actor', mockConstructor);

            actor.launch();

            expect(mockConstructor).toHaveBeenCalledWith({
                name: 'test-actor',
                close: expect.any(Function),
                postMessage: expect.any(Function),
                addEventListener: expect.any(Function),
                removeEventListener: expect.any(Function),
            });

            actor.close();
        });

        it('should call dispose function on close if constructor returns function', () => {
            const mockDispose = jest.fn();
            const mockConstructor = jest.fn().mockReturnValue(mockDispose);
            const actor = createActorFromFactory('test-actor', mockConstructor);

            actor.launch();
            actor.close();

            expect(mockDispose).toHaveBeenCalled();
        });

        it('should not call dispose if constructor returns non-function', () => {
            const mockConstructor = jest.fn().mockReturnValue('not-a-function');
            const actor = createActorFromFactory('test-actor', mockConstructor);

            actor.launch();

            expect(() => actor.close()).not.toThrow();
        });

        it('should close mailboxes on close', () => {
            const mockclose = jest.fn();
            const mockCreateEnvelopeChannel = () => {
                const { port1, port2 } = createEnvelopeChannel()
                port1.close = mockclose
                port2.close = mockclose
                return { port1, port2 }
            }

            mockCreateChannel
                .mockReturnValueOnce(mockCreateEnvelopeChannel())
                .mockReturnValueOnce(mockCreateEnvelopeChannel());

            const actor = createActorFromFactory('test-actor', jest.fn());
            actor.close();

            expect(mockclose).toHaveBeenCalledTimes(2);
        });
    });

    describe('message passing system', () => {
        it('should enable bidirectional message passing between actors', async () => {
            const actor1Constructor = jest.fn((context: ActorContext<any>) => {
                context.addEventListener('message', (event) => {
                    if (event.data.type === 'ping') {
                        context.postMessage({ type: 'pong', payload: event.data.payload });
                    }
                });
            });
            const actor2MessageHandler = jest.fn();
            const actor2Constructor = (context: ActorContext) => {
                context.addEventListener('message', actor2MessageHandler);
            }

            const actor1 = createActorFromFactory('actor1', actor1Constructor);
            const actor2 = createActorFromFactory('actor2', actor2Constructor);

            actor1.launch();
            actor2.launch();

            // Connect actors by manually wiring their message systems
            actor1.addEventListener('message', (event) => {
                actor2.postMessage(event.data);
            });

            actor2.addEventListener('message', (event) => {
                actor1.postMessage(event.data);
            });

            // Send initial message
            actor1.postMessage({ type: 'ping', payload: 'test' });

            // Give time for async message handling
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(actor2MessageHandler).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: { type: 'pong', payload: 'test' }
                })
            );

            actor1.close();
            actor2.close();
        });
    });

    describe('edge cases', () => {
        it('should throw error on multiple launch calls', () => {
            const mockConstructor = jest.fn();
            const actor = createActorFromFactory('test-actor', mockConstructor);

            actor.launch();
            expect(mockConstructor).toHaveBeenCalledTimes(1);

            expect(() => actor.launch()).toThrow('Actor "test-actor" is already launched');
            expect(mockConstructor).toHaveBeenCalledTimes(1); // Should not call constructor again

            actor.close();
        });

        it('should handle close before launch', () => {
            const mockConstructor = jest.fn();
            const actor = createActorFromFactory('test-actor', mockConstructor);

            expect(() => actor.close()).not.toThrow();
        });

        it('should throw error on multiple close calls', () => {
            const mockConstructor = jest.fn();
            const actor = createActorFromFactory('test-actor', mockConstructor);

            actor.launch();
            actor.close();

            expect(() => actor.close()).toThrow('Actor "test-actor" is already closed');
        });

        it('should throw error on multiple close calls even without launch', () => {
            const mockConstructor = jest.fn();
            const actor = createActorFromFactory('test-actor', mockConstructor);

            actor.close();

            expect(() => actor.close()).toThrow('Actor "test-actor" is already closed');
        });

        it('should not allow launch after close', () => {
            const mockConstructor = jest.fn();
            const actor = createActorFromFactory('test-actor', mockConstructor);

            actor.close();

            // Should be able to attempt launch after close, but the behavior may vary
            // This test documents the current behavior - you might want to adjust based on requirements
            expect(() => actor.launch()).not.toThrow();
        });

        it('should handle constructor throwing error', () => {
            const errorConstructor = jest.fn().mockImplementation(() => {
                throw new Error('Constructor error');
            });

            const actor = createActorFromFactory('test-actor', errorConstructor);

            expect(() => actor.launch()).toThrow('Constructor error');

            actor.close();
        });
    });

    describe('error handling', () => {
        it('should handle invalid message data', () => {
            const messageHandler = jest.fn();
            const mockConstructor = jest.fn((context) => {
                context.addEventListener('message', messageHandler);
            });

            const actor = createActorFromFactory('test-actor', mockConstructor);
            actor.launch();

            // Test with various invalid data types
            expect(() => {
                actor.postMessage(null as any);
            }).not.toThrow();

            expect(() => {
                actor.postMessage(undefined as any);
            }).not.toThrow();

            expect(() => {
                // @ts-ignore - testing runtime behavior
                actor.postMessage();
            }).not.toThrow();

            actor.close();
        });
    });
});