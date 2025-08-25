import { self } from '@apacheli/web-workers';
import { connectActorToMessagePort, createActor, onConnectMessagePort } from '../../dist/webactor.mjs';

console.log('Worker: Waiting for connection from main thread...');

const workerActor = createActor('worker-actor', (context) => {
    console.log('Worker: Actor initialized');
    
    // Listen for messages and respond
    context.addEventListener('message', (event) => {
        console.log('Worker Actor received:', event.data);
        
        if (event.data.type === 'ping') {
            context.postMessage({ 
                type: 'pong', 
                from: 'worker-actor',
                originalMessage: event.data 
            });
        }
        
        if (event.data.type === 'echo') {
            context.postMessage({
                type: 'echo-response',
                echoed: event.data.message,
                timestamp: Date.now()
            });
        }
    });
});
workerActor.launch();

// Handle connection from main thread
onConnectMessagePort(self, (port) => {
    // Connect the worker actor to the port (main thread)
    connectActorToMessagePort(workerActor, port);
});
