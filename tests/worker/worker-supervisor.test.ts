import { Worker } from '@apacheli/web-workers';
import '../locks';

import { applyWorkerSupervisor } from '../../src/applyWorkerSupervisor';
import { Actor } from '../../src/types';

function createWorker() {
    return new Worker(new URL("./worker.mjs", import.meta.url), {
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
            let createCount = 0;
            let errorCaught = false;

            const workerConstructor = () => {
                createCount++;
                const worker = createWorker();
                workers.push(worker);
                return worker;
            };

            supervisedActor = applyWorkerSupervisor(workerConstructor, {
                shouldRetry: async () => {
                    await new Promise(resolve => setTimeout(resolve, 50));
                    // If shouldRetry throws, it should be treated as false
                    throw new Error('Restart decision failed');
                }
            });

            // Capture any unhandled rejections
            const originalHandler = process.listeners('unhandledRejection');
            process.removeAllListeners('unhandledRejection');
            process.on('unhandledRejection', () => {
                errorCaught = true;
            });

            supervisedActor.launch();
            await new Promise(resolve => setTimeout(resolve, 300));

            // Restore original handlers
            process.removeAllListeners('unhandledRejection');
            originalHandler.forEach(handler => process.on('unhandledRejection', handler as any));

            expect(createCount).toBe(1);
            expect(errorCaught).toBe(false); // Error should be handled gracefully
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
                await new Promise(resolve => setTimeout(resolve, 200));
                
                expect(createCount).toBe(1);
                
                testSupervisor.close();
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            // All workers should be in our tracking array
            expect(workers.length).toBe(testCases.length);
        });
    });
});