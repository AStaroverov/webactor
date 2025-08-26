import { Worker } from '@apacheli/web-workers';
import '../locks';

import { createActor } from '../../src/createActor';
import { ActorContext } from '../../src/types';
import { connectActorToWorker } from '../../src/worker/connectActorToWorker';

function createWorker() {
    return new Worker(new URL("./worker.mjs", import.meta.url), {
        type: "module",
    });
}

describe('Worker Communication Tests', () => {
    let mainThreadActor: any;
    let worker: Worker;
    let disconnect: VoidFunction;

    afterEach(async () => {
        try {
            if (disconnect) {
                disconnect();
                disconnect = null as any;
            }
            if (mainThreadActor) {
                mainThreadActor.destroy();
                mainThreadActor = null;
            }
            if (worker) {
                worker.terminate();
                worker = null as any;
                // Give worker time to clean up
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        } catch (error) {
            console.warn('Cleanup error (ignoring):', error);
        }
    });

    it('should connect main thread actor to real Worker using connectActorToWorker', async () => {
        let mainActorContext: ActorContext<any> | null = null;
        const mainActorMessages: any[] = [];
        
        // Create main thread actor
        mainThreadActor = createActor('main-actor', (context: ActorContext) => {
            mainActorContext = context;
            context.addEventListener('message', (event) => {
                console.log('Main Actor: Received message:', event.data);
                mainActorMessages.push(event.data);
            });
        });
        
        // Create real Worker
        worker = createWorker();
        
        // Connect actor to worker using the actual function
        disconnect = connectActorToWorker(mainThreadActor, worker);
        
        // Launch main actor
        mainThreadActor.launch();
        
        // Wait a bit for connection to establish
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Send message from main actor to worker
        mainActorContext!.postMessage({
            type: 'echo',
            message: 'Hello from main thread actor!',
            timestamp: Date.now()
        });
        
        // Wait for worker to process and respond
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Verify actor received response from worker
        expect(mainActorMessages.length).toBeGreaterThan(0);
        
        const echoResponse = mainActorMessages.find(msg => msg.type === 'echo-response');
        expect(echoResponse).toBeDefined();
        expect(echoResponse?.echoed).toBe('Hello from main thread actor!');
    }, 10000);

    it('should handle heavy computation in worker without blocking main thread', async () => {
        let mainActorContext: ActorContext<any> | null = null;
        const mainActorMessages: any[] = [];
        
        // Create main thread actor
        mainThreadActor = createActor('compute-requester', (context: ActorContext) => {
            mainActorContext = context;
            context.addEventListener('message', (event) => {
                console.log('Main Actor: Computation result received:', event.data);
                mainActorMessages.push(event.data);
            });
        });
        
        // Create worker and connect
        worker = createWorker();
        disconnect = connectActorToWorker(mainThreadActor, worker);
        mainThreadActor.launch();
        
        // Wait for connection
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Record start time to verify non-blocking behavior
        const startTime = Date.now();
        
        // Request heavy computation
        mainActorContext!.postMessage({
            type: 'compute',
            iterations: 5000000
        });
        
        // Do some work on main thread while worker computes
        let mainThreadWork = 0;
        const mainThreadInterval = setInterval(() => {
            mainThreadWork += 1;
        }, 10);
        
        // Wait for computation result
        await new Promise((resolve) => {
            const checkResult = () => {
                const result = mainActorMessages.find(msg => msg.type === 'computation-result');
                if (result) {
                    clearInterval(mainThreadInterval);
                    resolve(result);
                } else {
                    setTimeout(checkResult, 50);
                }
            };
            checkResult();
        });
        
        const totalTime = Date.now() - startTime;
        const computationResult = mainActorMessages.find(msg => msg.type === 'computation-result');
        
        // Verify computation completed
        expect(computationResult).toBeDefined();
        expect(computationResult.result).toBeGreaterThan(0);
        expect(computationResult.iterations).toBe(5000000);
        
        // Verify main thread wasn't blocked (could do work during computation)
        expect(mainThreadWork).toBeGreaterThan(0);
        
        console.log(`Computation took ${computationResult.duration}ms in worker`);
        console.log(`Main thread did ${mainThreadWork} work units during computation`);
        console.log(`Total test time: ${totalTime}ms`);
        
    }, 15000);

    it('should handle multiple workers simultaneously', async () => {
        // Create two workers
        const worker1 = createWorker();
        const worker2 = createWorker();
        
        // Create two main thread actors
        let actor1Context: ActorContext<any> | null = null;
        let actor2Context: ActorContext<any> | null = null;
        
        const actor1Messages: any[] = [];
        const actor2Messages: any[] = [];
        
        const actor1 = createActor('actor1', (context: ActorContext) => {
            actor1Context = context;
            context.addEventListener('message', (event) => {
                actor1Messages.push({ ...(event.data as object), receivedBy: 'actor1' });
            });
        });
        
        const actor2 = createActor('actor2', (context: ActorContext) => {
            actor2Context = context;
            context.addEventListener('message', (event) => {
                actor2Messages.push({ ...(event.data as object), receivedBy: 'actor2' });
            });
        });
        
        // Connect actors to workers
        const disconnect1 = connectActorToWorker(actor1, worker1);
        const disconnect2 = connectActorToWorker(actor2, worker2);
        
        actor1.launch();
        actor2.launch();
        
        // Wait for connections
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Send different messages to each worker
        actor1Context!.postMessage({
            type: 'echo',
            message: 'Message to worker 1',
            sender: 'actor1'
        });
        
        actor2Context!.postMessage({
            type: 'echo',
            message: 'Message to worker 2', 
            sender: 'actor2'
        });
        
        // Wait for responses
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Verify each actor got its own response
        expect(actor1Messages).toContainEqual(
            expect.objectContaining({
                type: 'echo-response',
                echoed: 'Message to worker 1',
                receivedBy: 'actor1'
            })
        );
        
        expect(actor2Messages).toContainEqual(
            expect.objectContaining({
                type: 'echo-response',
                echoed: 'Message to worker 2',
                receivedBy: 'actor2'
            })
        );
        
        // Verify no cross-contamination
        expect(actor1Messages.find(msg => msg.echoed === 'Message to worker 2')).toBeUndefined();
        expect(actor2Messages.find(msg => msg.echoed === 'Message to worker 1')).toBeUndefined();
        
        // Cleanup
        disconnect1();
        disconnect2();
        actor1.destroy();
        actor2.destroy();
        worker1.terminate();
        worker2.terminate();
        
        // Give workers time to clean up
        await new Promise(resolve => setTimeout(resolve, 50));
    }, 15000);
});