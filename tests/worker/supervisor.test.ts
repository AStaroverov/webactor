import '../locks';

import { Worker } from '@apacheli/web-workers';
import { afterEach, describe, expect, it } from 'vitest';

import { Actor } from '../../src/types';
import { applyWorkerSupervisor } from '../../src/worker/applyWorkerSupervisor';

function createWorker() {
    return new Worker(new URL("./worker.mjs", import.meta.url), {
        type: "module",
    });
}

function createErrorWorker() {
    return new Worker(new URL("./error-worker.mjs", import.meta.url), {
        type: "module",
    });
}


describe('Worker Supervisor Tests with Real Workers', () => {
    let supervisedActor: Actor;
    let workers: Worker[] = [];

    afterEach(async () => {
        try {
            if (supervisedActor) {
                supervisedActor.close();
                supervisedActor = null as any;
            }
            // Clean up any workers that might have been created
            for (const worker of workers) {
                try {
                    worker.terminate();
                } catch (error) {
                    console.warn('Worker cleanup error (ignoring):', error);
                }
            }
            workers = [];
            // Give workers time to clean up
            await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
            console.warn('Cleanup error (ignoring):', error);
        }
    });

    describe('applyWorkerSupervisor with real workers', () => {
        it('should create a supervised worker actor with real Worker', async () => {
            const workerConstructor = () => {
                const worker = createWorker();
                workers.push(worker);
                return worker;
            };

            supervisedActor = applyWorkerSupervisor(workerConstructor, {
                shouldRetry: () => false
            });

            expect(supervisedActor.name).toMatch(/^WorkerSupervisor</);
            expect(supervisedActor.launch).toBeDefined();
            expect(supervisedActor.close).toBeDefined();

            supervisedActor.launch();
            await new Promise(resolve => setTimeout(resolve, 200));

            // Worker should be created
            expect(workers).toHaveLength(1);
        });

        it('should support async shouldRetry function with real workers', async () => {
            let createCount = 0;
            const retryDecisions: boolean[] = [];

            const workerConstructor = () => {
                createCount++;
                const worker = createWorker();
                workers.push(worker);
                return worker;
            };

            supervisedActor = applyWorkerSupervisor(workerConstructor, {
                shouldRetry: async (reason) => {
                    console.log(`Async shouldRetry called with reason:`, reason, `attempt: ${createCount}`);

                    // Simulate async decision making (e.g., checking external service)
                    await new Promise(resolve => setTimeout(resolve, 50));

                    const shouldRestart = false; // Don't restart for this test
                    retryDecisions.push(shouldRestart);

                    console.log(`Decision: ${shouldRestart ? 'RESTART' : 'STOP'}`);
                    return shouldRestart;
                }
            });

            supervisedActor.launch();

            // Wait for initialization
            await new Promise(resolve => setTimeout(resolve, 300));

            expect(createCount).toBe(1); // Only original worker
            expect(workers.length).toBe(1);
        });

        it('should handle async shouldRetry with Promise rejection for real worker', async () => {
            let retryCount = 0;
            let createCount = 0;

            const workerConstructor = () => {
                createCount++;
                const worker = createErrorWorker();
                workers.push(worker);
                return worker;
            };

            supervisedActor = applyWorkerSupervisor(workerConstructor, {
                shouldRetry: async () => {
                    retryCount++;
                    await new Promise(resolve => setTimeout(resolve, 50));
                    // If shouldRetry throws, it should be treated as false
                    throw new Error('Restart decision failed');
                }
            });

            supervisedActor.launch();
            await new Promise(resolve => setTimeout(resolve, 100));


            expect(retryCount).toBe(1);
            expect(createCount).toBe(1);
            expect(workers.length).toBe(1);
        });

        it('should properly clean up resources when supervisor with real worker is closed', async () => {
            let workerTerminated = false;
            let createCount = 0;

            const workerConstructor = () => {
                createCount++;
                const worker = createWorker();
                workers.push(worker);

                // Override terminate to track when it's called
                const originalTerminate = worker.terminate;
                worker.terminate = () => {
                    workerTerminated = true;
                    originalTerminate.call(worker);
                };

                return worker;
            };

            supervisedActor = applyWorkerSupervisor(workerConstructor, {
                shouldRetry: () => false
            });

            supervisedActor.launch();
            await new Promise(resolve => setTimeout(resolve, 200));

            // Close the supervisor
            supervisedActor.close();
            await new Promise(resolve => setTimeout(resolve, 100));

            expect(createCount).toBe(1);
            expect(workerTerminated).toBe(true);
        });

        it('should handle basic communication with real worker through supervisor', async () => {
            let createCount = 0;

            const workerConstructor = () => {
                createCount++;
                const worker = createWorker();
                workers.push(worker);
                return worker;
            };

            supervisedActor = applyWorkerSupervisor(workerConstructor, {
                shouldRetry: () => false
            });

            supervisedActor.launch();

            // Wait for worker to initialize
            await new Promise(resolve => setTimeout(resolve, 300));

            // Send a test message through the supervisor
            supervisedActor.postMessage({
                type: 'test',
                payload: { message: 'hello from supervisor test' }
            });

            // Wait for potential processing
            await new Promise(resolve => setTimeout(resolve, 200));

            // Basic assertion - worker was created and supervisor works
            expect(createCount).toBe(1);
            expect(workers.length).toBe(1);
        });

        it('should restart worker on actual error from error-worker.mjs', async () => {
            let createCount = 0;
            let restartReasons: any[] = [];

            const workerConstructor = () => {
                createCount++;
                console.log(`Creating worker #${createCount}`);
                const worker = createErrorWorker(); // Use worker that throws errors
                workers.push(worker);
                return worker;
            };

            supervisedActor = applyWorkerSupervisor(workerConstructor, {
                shouldRetry: async (reason) => {
                    console.log(`Restart decision for attempt ${createCount}:`, reason);
                    restartReasons.push(reason);

                    // Allow restart for first 2 errors
                    const shouldRestart = createCount < 3;
                    console.log(`Decision: ${shouldRestart ? 'RESTART' : 'STOP'}`);
                    return shouldRestart;
                }
            });

            supervisedActor.launch();

            // Wait for error worker to fail and restart cycles
            await new Promise(resolve => setTimeout(resolve, 100));

            console.log(`Final state: createCount=${createCount}, restartReasons:`, restartReasons);

            // Should have created multiple workers due to errors
            expect(createCount).toBeGreaterThan(1);
            expect(restartReasons.length).toBeGreaterThan(0);
            expect(workers.length).toBeGreaterThan(1);
        });

        it('should restart worker when terminated manually', async () => {
            let createCount = 0;
            let restartReasons: any[] = [];

            const workerConstructor = () => {
                createCount++;
                console.log(`Creating terminate-test worker #${createCount}`);
                const worker = createWorker();
                workers.push(worker);

                // Terminate the first worker after short delay
                if (createCount === 1) {
                    setTimeout(() => {
                        console.log('Manually terminating first worker...');
                        worker.terminate();
                    }, 300);
                }

                return worker;
            };

            supervisedActor = applyWorkerSupervisor(workerConstructor, {
                shouldRetry: async (reason) => {
                    console.log(`Restart decision for terminated worker, attempt ${createCount}:`, reason);
                    restartReasons.push(reason);

                    // Allow one restart
                    const shouldRestart = createCount < 2;
                    console.log(`Decision: ${shouldRestart ? 'RESTART' : 'STOP'}`);
                    return shouldRestart;
                }
            });

            supervisedActor.launch();

            // Wait for termination and restart
            await new Promise(resolve => setTimeout(resolve, 300));

            console.log(`Termination test result: createCount=${createCount}, restartReasons:`, restartReasons);

            // Should have restarted after termination
            expect(createCount).toBeGreaterThanOrEqual(2);
            expect(workers.length).toBeGreaterThanOrEqual(2);
        });

        it('should handle worker that throws error on message', async () => {
            let createCount = 0;
            let messageErrorCount = 0;

            const workerConstructor = () => {
                createCount++;
                const worker = createErrorWorker(); // This worker throws on messages
                workers.push(worker);
                return worker;
            };

            supervisedActor = applyWorkerSupervisor(workerConstructor, {
                shouldRetry: async (reason) => {
                    messageErrorCount++;
                    console.log(`Message error restart decision:`, reason);
                    return messageErrorCount < 3;
                }
            });

            supervisedActor.launch();
            await new Promise(resolve => setTimeout(resolve, 500));

            // Send message that will cause worker to throw
            supervisedActor.postMessage({
                type: 'trigger-error',
                data: 'This will cause error in worker'
            });

            // Wait for error processing
            await new Promise(resolve => setTimeout(resolve, 100));

            console.log(`Message error test: createCount=${createCount}, messageErrorCount=${messageErrorCount}`);

            expect(createCount).toBeGreaterThanOrEqual(1);
        });

        it('should support different shouldRetry return types', async () => {
            const testCases = [
                { shouldRetry: () => false, description: 'synchronous boolean' },
                { shouldRetry: () => Promise.resolve(false), description: 'Promise<boolean>' },
                { shouldRetry: async () => false, description: 'async boolean' }
            ];

            for (const testCase of testCases) {
                let createCount = 0;

                const workerConstructor = () => {
                    createCount++;
                    const worker = createWorker();
                    workers.push(worker);
                    return worker;
                };

                const testSupervisor = applyWorkerSupervisor(workerConstructor, {
                    shouldRetry: testCase.shouldRetry
                });

                testSupervisor.launch();
                await new Promise(resolve => setTimeout(resolve, 100));

                expect(createCount).toBe(1);

                testSupervisor.close();
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            // All workers should be in our tracking array  
            expect(workers.length).toBe(testCases.length);
        });
    });
});