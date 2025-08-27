import { applyActorSupervisor } from '../src/applyActorSupervisor';
import { createActorFactory } from '../src/createActorFactory';
import { createEnvelopeChannel } from '../src/createEnvelopePort';
import { Reason, ReasonReacord } from '../src/def';
import { Actor, ActorContext } from '../src/types';

const createActor = createActorFactory({ createChannel: createEnvelopeChannel });

describe('Actor Supervisors', () => {
    let supervisedActor: Actor;
    let actors: Actor[] = [];

    afterEach(async () => {
        try {
            if (supervisedActor) {
                supervisedActor.close();
            }
            actors.forEach(actor => {
                try {
                    actor.close();
                } catch (error) {
                    // Ignore cleanup errors
                }
            });
            actors = [];
            await new Promise(resolve => setTimeout(resolve, 50));
        } catch (error) {
            // Ignore cleanup errors
        }
    });

    describe('applyActorSupervisor', () => {
        it('should create a supervised actor that launches successfully', async () => {
            let launched = false;
            const actorConstructor = () => createActor('test-actor', () => {
                launched = true;
            });

            supervisedActor = applyActorSupervisor(actorConstructor, {
                shouldRetry: () => false
            });

            expect(supervisedActor.name).toMatch(/^ActorSupervisor</);
            supervisedActor.launch();
            await new Promise(resolve => setTimeout(resolve, 50));

            expect(launched).toBe(true);
        });

        it('should forward messages to the supervised actor', async () => {
            const receivedMessages: any[] = [];
            const actorConstructor = () => createActor('test-actor', (context: ActorContext) => {
                context.addEventListener('message', (event) => {
                    receivedMessages.push(event.data);
                });
            });

            supervisedActor = applyActorSupervisor(actorConstructor, {
                shouldRetry: () => false
            });

            supervisedActor.launch();
            await new Promise(resolve => setTimeout(resolve, 50));

            supervisedActor.postMessage({ type: 'test', payload: 'hello' });
            await new Promise(resolve => setTimeout(resolve, 100));

            expect(receivedMessages).toHaveLength(1);
            expect(receivedMessages[0]).toEqual({ type: 'test', payload: 'hello' });
        });

        it('should restart actor on error when shouldRetry returns true', async () => {
            let launchCount = 0;
            let testActor: Actor;

            const actorConstructor = () => {
                launchCount++;
                testActor = createActor('test-actor', () => {
                    if (launchCount === 1) {
                        setTimeout(() => {
                            testActor.close(new Error('Test error'));
                        }, 10);
                    }
                });
                return testActor;
            };

            supervisedActor = applyActorSupervisor(actorConstructor, {
                shouldRetry: (reason: unknown | Reason) => {
                    return reason instanceof Error && launchCount < 3;
                }
            });

            supervisedActor.launch();
            await new Promise(resolve => setTimeout(resolve, 200));

            expect(launchCount).toBeGreaterThan(1);
        });

        it('should not restart actor when shouldRetry returns false', async () => {
            let launchCount = 0;
            let testActor: Actor;

            const actorConstructor = () => {
                launchCount++;
                testActor = createActor('test-actor', () => {
                    setTimeout(() => {
                        testActor.close(new Error('Test error'));
                    }, 10);
                });
                return testActor;
            };

            supervisedActor = applyActorSupervisor(actorConstructor, {
                shouldRetry: (reason: unknown | Reason) => {
                    return !(reason instanceof Error);
                }
            });

            supervisedActor.launch();
            await new Promise(resolve => setTimeout(resolve, 100));

            expect(launchCount).toBe(1);
        });

        it('should handle actor close event and restart if shouldRetry allows', async () => {
            let launchCount = 0;
            let testActor: Actor;

            const actorConstructor = () => {
                launchCount++;
                testActor = createActor('test-actor', () => {
                    if (launchCount === 1) {
                        setTimeout(() => {
                            testActor.close('manual close');
                        }, 10);
                    }
                });
                return testActor;
            };

            supervisedActor = applyActorSupervisor(actorConstructor, {
                shouldRetry: (reason: unknown | Reason) => {
                    return reason === 'manual close' && launchCount < 3;
                }
            });

            supervisedActor.launch();
            await new Promise(resolve => setTimeout(resolve, 200));

            expect(launchCount).toBeGreaterThan(1);
        });

        it('should handle different types of reasons for restart decision', async () => {
            const reasons: any[] = [];
            let launchCount = 0;
            let testActor: Actor;

            const actorConstructor = () => {
                launchCount++;
                testActor = createActor('test-actor', () => {
                    if (launchCount === 1) {
                        setTimeout(() => testActor.close('custom-reason'), 10);
                    } else if (launchCount === 2) {
                        setTimeout(() => testActor.close(ReasonReacord.Restart), 10);
                    }
                });
                return testActor;
            };

            supervisedActor = applyActorSupervisor(actorConstructor, {
                shouldRetry: (reason: any) => {
                    reasons.push(reason);
                    return launchCount < 3;
                }
            });

            supervisedActor.launch();
            await new Promise(resolve => setTimeout(resolve, 300));

            expect(reasons.length).toBeGreaterThan(0);
            expect(launchCount).toBe(3);

            // Check that we received the custom reason in some form
            const hasCustomReason = reasons.some(r => r === 'custom-reason');
            expect(hasCustomReason).toBe(true);
        });

        it('should properly clean up resources when supervisor is closed', async () => {
            let cleaned = false;
            const actorConstructor = () => createActor('test-actor', () => {
                return () => {
                    cleaned = true;
                };
            });

            supervisedActor = applyActorSupervisor(actorConstructor, {
                shouldRetry: () => false
            });

            supervisedActor.launch();
            await new Promise(resolve => setTimeout(resolve, 50));

            supervisedActor.close();
            await new Promise(resolve => setTimeout(resolve, 50));

            expect(cleaned).toBe(true);
        });

        it('should handle multiple rapid restarts correctly', async () => {
            let launchCount = 0;
            let testActor: Actor;

            const actorConstructor = () => {
                launchCount++;
                testActor = createActor('test-actor', () => {
                    setTimeout(() => testActor.close('rapid-restart'), 5);
                });
                return testActor;
            };

            supervisedActor = applyActorSupervisor(actorConstructor, {
                shouldRetry: () => launchCount < 5
            });

            supervisedActor.launch();
            await new Promise(resolve => setTimeout(resolve, 500));

            expect(launchCount).toBe(5);
        });

        it('should support async shouldRetry function', async () => {
            let launchCount = 0;
            let testActor: Actor;
            const retryDecisions: boolean[] = [];

            const actorConstructor = () => {
                launchCount++;
                testActor = createActor('test-actor', () => {
                    if (launchCount <= 3) {
                        setTimeout(() => {
                            testActor.close(new Error(`Error ${launchCount}`));
                        }, 10);
                    }
                });
                return testActor;
            };

            supervisedActor = applyActorSupervisor(actorConstructor, {
                shouldRetry: async (reason: unknown | Reason) => {
                    // Simulate async decision making (e.g., checking external service)
                    await new Promise(resolve => setTimeout(resolve, 50));

                    const shouldRestart = reason instanceof Error && launchCount < 3;
                    retryDecisions.push(shouldRestart);
                    return shouldRestart;
                }
            });

            supervisedActor.launch();
            await new Promise(resolve => setTimeout(resolve, 500));

            expect(launchCount).toBe(3);
            expect(retryDecisions).toEqual([true, true, false]);
        });
    });
});