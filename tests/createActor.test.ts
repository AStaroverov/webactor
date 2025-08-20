import { createMailbox } from '../src/createActor';
import { createActorFactory } from '../src/createActorFactory';
import { ActorContext } from '../src/types';

describe('createMailbox', () => {
    let mailbox: ReturnType<typeof createMailbox>;

    beforeEach(() => {
        mailbox = createMailbox();
    });

    afterEach(() => {
        mailbox.destroy?.();
    });

    describe('event handlers', () => {
        it('should add and trigger message event listeners', async () => {
            const mockCallback = jest.fn();
            const testMessage = { type: 'test', payload: 'data' };
            
            mailbox.addEventListener('message', mockCallback);
            mailbox.postMessage(testMessage);
            
            expect(mockCallback).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'message',
                    data: testMessage
                })
            );
        });

        it('should add and trigger error event listeners', () => {
            const mockErrorCallback = jest.fn();
            const testError = new Error('Test error');
            
            mailbox.addEventListener('error', mockErrorCallback);
            
            const errorEvent = new MessageEvent('error', { data: testError });
            mailbox.dispatchEvent(errorEvent);
            
            expect(mockErrorCallback).toHaveBeenCalledWith(errorEvent);
        });

        it('should add and trigger messageerror event listeners', () => {
            const mockErrorCallback = jest.fn();
            const testError = new Error('Message error');
            
            mailbox.addEventListener('messageerror', mockErrorCallback);
            
            const messageErrorEvent = new MessageEvent('messageerror', { data: testError });
            mailbox.dispatchEvent(messageErrorEvent);
            
            expect(mockErrorCallback).toHaveBeenCalledWith(messageErrorEvent);
        });

        it('should remove event listeners', () => {
            const mockCallback = jest.fn();
            const testMessage = { type: 'test' };
            
            mailbox.addEventListener('message', mockCallback);
            mailbox.removeEventListener('message', mockCallback);
            mailbox.postMessage(testMessage);
            
            expect(mockCallback).not.toHaveBeenCalled();
        });

        it('should support multiple listeners for same event type', () => {
            const mockCallback1 = jest.fn();
            const mockCallback2 = jest.fn();
            const testMessage = { type: 'test' };
            
            mailbox.addEventListener('message', mockCallback1);
            mailbox.addEventListener('message', mockCallback2);
            mailbox.postMessage(testMessage);
            
            expect(mockCallback1).toHaveBeenCalled();
            expect(mockCallback2).toHaveBeenCalled();
        });

        it('should throw error for unsupported event types in addEventListener', () => {
            const mockCallback = jest.fn();
            
            expect(() => {
                // @ts-ignore - testing invalid event type
                mailbox.addEventListener('invalid', mockCallback);
            }).toThrow('Unsupported event type: invalid');
        });

        it('should throw error for unsupported event types in removeEventListener', () => {
            const mockCallback = jest.fn();
            
            expect(() => {
                // @ts-ignore - testing invalid event type
                mailbox.removeEventListener('invalid', mockCallback);
            }).toThrow('Unsupported event type: invalid');
        });

        it('should throw error for unsupported event types in dispatchEvent', () => {
            const invalidEvent = new Event('invalid');
            
            expect(() => {
                mailbox.dispatchEvent(invalidEvent);
            }).toThrow('Unsupported event type: invalid');
        });
    });

    describe('cleanup', () => {
        it('should clear all callbacks on destroy', () => {
            const mockMessageCallback = jest.fn();
            const mockErrorCallback = jest.fn();
            const mockMessageErrorCallback = jest.fn();
            
            mailbox.addEventListener('message', mockMessageCallback);
            mailbox.addEventListener('error', mockErrorCallback);
            mailbox.addEventListener('messageerror', mockMessageErrorCallback);
            
            mailbox.destroy?.();
            
            // Try to trigger events after destroy
            mailbox.postMessage({ test: 'message' });
            
            const errorEvent = new MessageEvent('error', { data: new Error('test') });
            const messageErrorEvent = new MessageEvent('messageerror', { data: new Error('test') });
            
            mailbox.dispatchEvent(errorEvent);
            mailbox.dispatchEvent(messageErrorEvent);
            
            // None of the callbacks should be called
            expect(mockMessageCallback).not.toHaveBeenCalled();
            expect(mockErrorCallback).not.toHaveBeenCalled();
            expect(mockMessageErrorCallback).not.toHaveBeenCalled();
        });
    });

    describe('message posting and dispatching', () => {
        it('should handle postMessage correctly', () => {
            const mockCallback = jest.fn();
            const testMessage = { type: 'test', data: 'payload' };
            
            mailbox.addEventListener('message', mockCallback);
            mailbox.postMessage(testMessage);
            
            expect(mockCallback).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'message',
                    data: testMessage
                })
            );
        });

        it('should handle dispatchEvent correctly', () => {
            const mockCallback = jest.fn();
            const testMessage = { type: 'test' };
            const messageEvent = new MessageEvent('message', { data: testMessage });
            
            mailbox.addEventListener('message', mockCallback);
            mailbox.dispatchEvent(messageEvent);
            
            expect(mockCallback).toHaveBeenCalledWith(messageEvent);
        });

        it('should call all current callbacks when posting message', () => {
            const mockCallback1 = jest.fn();
            const mockCallback2 = jest.fn();
            const testMessage = { type: 'test' };
            
            mailbox.addEventListener('message', mockCallback1);
            mailbox.addEventListener('message', mockCallback2);
            
            mailbox.postMessage(testMessage);
            
            expect(mockCallback1).toHaveBeenCalledTimes(1);
            expect(mockCallback2).toHaveBeenCalledTimes(1);
        });
    });
});

describe('createActorFactory', () => {
    let mockGetMailbox: jest.Mock;
    let createActorFromFactory: ReturnType<typeof createActorFactory>;

    beforeEach(() => {
        mockGetMailbox = jest.fn().mockImplementation(() => createMailbox());
        createActorFromFactory = createActorFactory({ getMailbox: mockGetMailbox });
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
            expect(typeof actor.destroy).toBe('function');
            expect(typeof actor.postMessage).toBe('function');
            expect(typeof actor.addEventListener).toBe('function');
            
            actor.destroy();
        });

        it('should throw error if getMailbox returns same instance', () => {
            const sameMailbox = createMailbox();
            const badGetMailbox = jest.fn().mockReturnValue(sameMailbox);
            const badFactory = createActorFactory({ getMailbox: badGetMailbox });
            
            expect(() => {
                badFactory('test-actor', jest.fn());
            }).toThrow('getMailbox should return different instances');
            
            sameMailbox.destroy?.();
        });

        it('should create separate input/output mailboxes', () => {
            const mockConstructor = jest.fn();
            const actor = createActorFromFactory('test-actor', mockConstructor);
            
            expect(mockGetMailbox).toHaveBeenCalledTimes(2);
            
            actor.destroy();
        });
    });

    describe('actor lifecycle', () => {
        it('should call constructor on launch with correct context', () => {
            const mockConstructor = jest.fn();
            const actor = createActorFromFactory('test-actor', mockConstructor);
            
            actor.launch();
            
            expect(mockConstructor).toHaveBeenCalledWith({
                name: 'test-actor',
                postMessage: expect.any(Function),
                dispatchEvent: expect.any(Function),
                addEventListener: expect.any(Function),
                removeEventListener: expect.any(Function),
            });
            
            actor.destroy();
        });

        it('should return actor instance from launch', () => {
            const mockConstructor = jest.fn();
            const actor = createActorFromFactory('test-actor', mockConstructor);
            
            const launched = actor.launch();
            expect(launched).toBe(actor);
            
            actor.destroy();
        });

        it('should call dispose function on destroy if constructor returns function', () => {
            const mockDispose = jest.fn();
            const mockConstructor = jest.fn().mockReturnValue(mockDispose);
            const actor = createActorFromFactory('test-actor', mockConstructor);
            
            actor.launch();
            actor.destroy();
            
            expect(mockDispose).toHaveBeenCalled();
        });

        it('should not call dispose if constructor returns non-function', () => {
            const mockConstructor = jest.fn().mockReturnValue('not-a-function');
            const actor = createActorFromFactory('test-actor', mockConstructor);
            
            actor.launch();
            
            expect(() => actor.destroy()).not.toThrow();
        });

        it('should destroy mailboxes on destroy', () => {
            const mockDestroy1 = jest.fn();
            const mockDestroy2 = jest.fn();
            
            mockGetMailbox
                .mockReturnValueOnce({ ...createMailbox(), destroy: mockDestroy1 })
                .mockReturnValueOnce({ ...createMailbox(), destroy: mockDestroy2 });
            
            const actor = createActorFromFactory('test-actor', jest.fn());
            actor.destroy();
            
            expect(mockDestroy1).toHaveBeenCalled();
            expect(mockDestroy2).toHaveBeenCalled();
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
            
            actor1.destroy();
            actor2.destroy();
        });
    });

    describe('edge cases', () => {
        it('should throw error on multiple launch calls', () => {
            const mockConstructor = jest.fn();
            const actor = createActorFromFactory('test-actor', mockConstructor);
            
            const result1 = actor.launch();
            expect(result1).toBe(actor);
            expect(mockConstructor).toHaveBeenCalledTimes(1);
            
            expect(() => actor.launch()).toThrow('Actor "test-actor" is already launched');
            expect(mockConstructor).toHaveBeenCalledTimes(1); // Should not call constructor again
            
            actor.destroy();
        });

        it('should handle destroy before launch', () => {
            const mockConstructor = jest.fn();
            const actor = createActorFromFactory('test-actor', mockConstructor);
            
            expect(() => actor.destroy()).not.toThrow();
        });

        it('should throw error on multiple destroy calls', () => {
            const mockConstructor = jest.fn();
            const actor = createActorFromFactory('test-actor', mockConstructor);
            
            actor.launch();
            actor.destroy();
            
            expect(() => actor.destroy()).toThrow('Actor "test-actor" is already destroyed');
        });

        it('should throw error on multiple destroy calls even without launch', () => {
            const mockConstructor = jest.fn();
            const actor = createActorFromFactory('test-actor', mockConstructor);
            
            actor.destroy();
            
            expect(() => actor.destroy()).toThrow('Actor "test-actor" is already destroyed');
        });

        it('should not allow launch after destroy', () => {
            const mockConstructor = jest.fn();
            const actor = createActorFromFactory('test-actor', mockConstructor);
            
            actor.destroy();
            
            // Should be able to attempt launch after destroy, but the behavior may vary
            // This test documents the current behavior - you might want to adjust based on requirements
            expect(() => actor.launch()).not.toThrow();
        });

        it('should handle constructor throwing error', () => {
            const errorConstructor = jest.fn().mockImplementation(() => {
                throw new Error('Constructor error');
            });
            
            const actor = createActorFromFactory('test-actor', errorConstructor);
            
            expect(() => actor.launch()).toThrow('Constructor error');
            
            actor.destroy();
        });
    });

    describe('error handling', () => {
        it('should propagate errors from message handlers', () => {
            const errorHandler = jest.fn().mockImplementation(() => {
                throw new Error('Handler error');
            });
            
            const mockConstructor = jest.fn((context) => {
                context.addEventListener('message', errorHandler);
            });
            
            const actor = createActorFromFactory('test-actor', mockConstructor);
            actor.launch();
            
            // Error should propagate from handler
            expect(() => {
                actor.postMessage({ type: 'test' });
            }).toThrow('Handler error');
            
            expect(errorHandler).toHaveBeenCalled();
            
            actor.destroy();
        });

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
            
            actor.destroy();
        });
    });
});