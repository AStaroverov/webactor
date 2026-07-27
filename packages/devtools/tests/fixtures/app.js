import { connectActors, createActor } from '/webactor/dist/index.js';

const received = [];

const consumer = createActor('fixture-consumer', (context) => {
    const listener = (envelope) => received.push(envelope.data);
    context.addEventListener('message', listener);
    return () => context.removeEventListener('message', listener);
});

const producer = createActor('fixture-producer', (context) => {
    context.postMessage({ hello: 'world' });
});

connectActors(consumer, producer);
consumer.launch();
producer.launch();

window.__fixture = { received };
