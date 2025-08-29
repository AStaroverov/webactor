import './polyfil.mjs';

console.log('Error Worker: Starting worker with intentional error...');

// Throw an error immediately to test error handling
setTimeout(() => {
    console.log('Error Worker: About to throw error');
    throw new Error('Intentional worker error for testing');
}, 100);

// Also listen for messages and respond with errors
self.addEventListener('message', (event) => {
    console.log('Error Worker: Received message, responding with error');
    throw new Error('Worker failed to process message');
});