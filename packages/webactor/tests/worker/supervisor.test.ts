import '../locks';

import { Worker } from '@apacheli/web-workers';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Actor, AnyData } from '../../src/types';
import { applyWorkerSupervisor } from '../../src/worker/applyWorkerSupervisor';

function createWorker() {
    return new Worker(new URL('./worker.mjs', import.meta.url), {
        type: 'module',
    });
}

function createErrorWorker() {
    return new Worker(new URL('./error-worker.mjs', import.meta.url), {
        type: 'module',
    });
}

function isTaggedData(data: AnyData, type: string) {
    return typeof data === 'object' && data !== null && 'type' in data && data.type === type;
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
            await new Promise((resolve) => setTimeout(resolve, 100));
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
                shouldRetry: () => false,
            });

            expect(supervisedActor.name).toMatch(/^WorkerSupervisor</);
            expect(supervisedActor.launch).toBeDefined();
            expect(supervisedActor.close).toBeDefined();

            supervisedActor.launch();
            await new Promise((resolve) => setTimeout(resolve, 200));

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
                    await new Promise((resolve) => setTimeout(resolve, 50));

                    const shouldRestart = false; // Don't restart for this test
                    retryDecisions.push(shouldRestart);

                    console.log(`Decision: ${shouldRestart ? 'RESTART' : 'STOP'}`);
                    return shouldRestart;
                },
            });

            supervisedActor.launch();

            // Wait for initialization
            await new Promise((resolve) => setTimeout(resolve, 300));

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
                    await new Promise((resolve) => setTimeout(resolve, 50));
                    // If shouldRetry throws, it should be treated as false
                    throw new Error('Restart decision failed');
                },
            });

            supervisedActor.launch();
            await vi.waitFor(() => expect(retryCount).toBeGreaterThanOrEqual(1), { timeout: 5000, interval: 10 });
            await new Promise((resolve) => setTimeout(resolve, 200));

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
                shouldRetry: () => false,
            });

            supervisedActor.launch();
            await new Promise((resolve) => setTimeout(resolve, 200));

            // Close the supervisor
            supervisedActor.close();
            await new Promise((resolve) => setTimeout(resolve, 100));

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
                shouldRetry: () => false,
            });

            supervisedActor.launch();

            // Wait for worker to initialize
            await new Promise((resolve) => setTimeout(resolve, 300));

            // Send a test message through the supervisor
            supervisedActor.postMessage({
                type: 'test',
                payload: { message: 'hello from supervisor test' },
            });

            // Wait for potential processing
            await new Promise((resolve) => setTimeout(resolve, 200));

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
                },
            });

            supervisedActor.launch();

            await vi.waitFor(
                () => {
                    expect(createCount).toBeGreaterThan(1);
                    expect(restartReasons.length).toBeGreaterThan(0);
                    expect(workers.length).toBeGreaterThan(1);
                },
                { timeout: 5000, interval: 10 },
            );

            console.log(`Final state: createCount=${createCount}, restartReasons:`, restartReasons);
        });

        it('should restart worker when terminated manually', async () => {
            let createCount = 0;
            let restartReasons: any[] = [];

            const workerConstructor = () => {
                createCount++;
                console.log(`Creating terminate-test worker #${createCount}`);
                const worker = createWorker();
                workers.push(worker);
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
                },
            });

            let pongs = 0;
            supervisedActor.addEventListener('message', (envelope) => {
                if (isTaggedData(envelope.data, 'pong')) pongs++;
            });

            supervisedActor.launch();

            // terminating before the worker has connected leaves nothing for the supervisor to notice
            await vi.waitFor(
                () => {
                    supervisedActor.postMessage({ type: 'ping' });
                    expect(pongs).toBeGreaterThan(0);
                },
                { timeout: 5000, interval: 20 },
            );

            console.log('Manually terminating first worker...');
            workers[0].terminate();

            await vi.waitFor(
                () => {
                    expect(createCount).toBeGreaterThanOrEqual(2);
                    expect(workers.length).toBeGreaterThanOrEqual(2);
                },
                { timeout: 5000, interval: 10 },
            );

            console.log(`Termination test result: createCount=${createCount}, restartReasons:`, restartReasons);
        });

        it('should detect a worker that dies before the handshake when given an abort signal', async () => {
            let createCount = 0;
            const reasons: unknown[] = [];

            const workerConstructor = () => {
                createCount++;
                const worker = createWorker();
                workers.push(worker);
                if (createCount === 1) worker.terminate();
                return worker;
            };

            supervisedActor = applyWorkerSupervisor(workerConstructor, {
                getAbortSignal: () => AbortSignal.timeout(150),
                shouldRetry: async (reason) => {
                    reasons.push(reason);
                    return false;
                },
            });

            supervisedActor.launch();

            await vi.waitFor(() => expect(reasons.length).toBeGreaterThan(0), { timeout: 5000, interval: 10 });

            expect(reasons[0]).toBeInstanceOf(Error);
            expect(String(reasons[0])).toContain('TimeoutError');
            expect(createCount).toBe(1);
        });

        it('should leave a worker that dies before the handshake unnoticed without an abort signal', async () => {
            let createCount = 0;
            let decisions = 0;

            const workerConstructor = () => {
                createCount++;
                const worker = createWorker();
                workers.push(worker);
                if (createCount === 1) worker.terminate();
                return worker;
            };

            supervisedActor = applyWorkerSupervisor(workerConstructor, {
                shouldRetry: async () => {
                    decisions++;
                    return false;
                },
            });

            supervisedActor.launch();
            await new Promise((resolve) => setTimeout(resolve, 600));

            expect(decisions).toBe(0);
            expect(createCount).toBe(1);
        });

        it('should build a fresh abort signal for every relaunch', async () => {
            let createCount = 0;
            let signalCount = 0;
            const reasons: unknown[] = [];

            const workerConstructor = () => {
                createCount++;
                const worker = createWorker();
                workers.push(worker);
                if (createCount <= 2) worker.terminate();
                return worker;
            };

            supervisedActor = applyWorkerSupervisor(workerConstructor, {
                getAbortSignal: () => {
                    signalCount++;
                    return AbortSignal.timeout(150);
                },
                shouldRetry: async (reason) => {
                    reasons.push(reason);
                    return reasons.length < 2;
                },
            });

            supervisedActor.launch();

            // a single signal would already be spent here, so the second worker would go unwatched
            await vi.waitFor(() => expect(reasons.length).toBe(2), { timeout: 5000, interval: 10 });

            expect(signalCount).toBe(createCount);
            expect(createCount).toBe(2);
        });

        it('should treat a plain abort from the caller as a failed handshake', async () => {
            let createCount = 0;
            const reasons: unknown[] = [];
            const abortController = new AbortController();

            const workerConstructor = () => {
                createCount++;
                const worker = createWorker();
                workers.push(worker);
                if (createCount === 1) worker.terminate();
                return worker;
            };

            supervisedActor = applyWorkerSupervisor(workerConstructor, {
                getAbortSignal: () => abortController.signal,
                shouldRetry: async (reason) => {
                    reasons.push(reason);
                    return false;
                },
            });

            supervisedActor.launch();
            abortController.abort();

            await vi.waitFor(() => expect(reasons.length).toBeGreaterThan(0), { timeout: 5000, interval: 10 });

            expect(createCount).toBe(1);
        });

        it('should not ask for a restart decision when the supervisor itself is closed', async () => {
            let decisions = 0;

            const workerConstructor = () => {
                const worker = createWorker();
                workers.push(worker);
                return worker;
            };

            supervisedActor = applyWorkerSupervisor(workerConstructor, {
                getAbortSignal: () => AbortSignal.timeout(5000),
                shouldRetry: async () => {
                    decisions++;
                    return false;
                },
            });

            supervisedActor.launch();
            supervisedActor.close();
            await new Promise((resolve) => setTimeout(resolve, 300));

            expect(decisions).toBe(0);
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
                },
            });

            supervisedActor.launch();
            await new Promise((resolve) => setTimeout(resolve, 500));

            // Send message that will cause worker to throw
            supervisedActor.postMessage({
                type: 'trigger-error',
                data: 'This will cause error in worker',
            });

            // Wait for error processing
            await new Promise((resolve) => setTimeout(resolve, 100));

            console.log(`Message error test: createCount=${createCount}, messageErrorCount=${messageErrorCount}`);

            expect(createCount).toBeGreaterThanOrEqual(1);
        });

        it('should support different shouldRetry return types', async () => {
            const testCases = [
                { shouldRetry: () => false, description: 'synchronous boolean' },
                { shouldRetry: () => Promise.resolve(false), description: 'Promise<boolean>' },
                { shouldRetry: async () => false, description: 'async boolean' },
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
                    shouldRetry: testCase.shouldRetry,
                });

                testSupervisor.launch();
                await new Promise((resolve) => setTimeout(resolve, 100));

                expect(createCount).toBe(1);

                testSupervisor.close();
                await new Promise((resolve) => setTimeout(resolve, 100));
            }

            // All workers should be in our tracking array
            expect(workers.length).toBe(testCases.length);
        });
    });
});
