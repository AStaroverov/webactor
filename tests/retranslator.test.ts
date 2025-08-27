import { ActorContext, connectActors, createActor, createRetranslator } from '../src/index';

describe('Retranslator Tests', () => {
    let retranslator: any;
    let targetActor: any;
    let sourceActor: any;
    let disconnectFunctions: VoidFunction[] = [];

    afterEach(async () => {
        try {
            disconnectFunctions.forEach(disconnect => {
                try {
                    disconnect();
                } catch (e) {
                    console.warn('Disconnect error (ignoring):', e);
                }
            });
            disconnectFunctions = [];

            if (retranslator) {
                retranslator.close();
                retranslator = null;
            }
            if (targetActor) {
                targetActor.close();
                targetActor = null;
            }
            if (sourceActor) {
                sourceActor.close();
                sourceActor = null;
            }
        } catch (error) {
            console.warn('Cleanup error (ignoring):', error);
        }
    });

    it('should forward messages through connectActors chain', async () => {
        const receivedMessages: any[] = [];
        const testMessage1 = { type: 'test', content: 'Hello through retranslator!' };
        const testMessage2 = { type: 'data', value: 42, timestamp: Date.now() };

        sourceActor = createActor('source', (context: ActorContext) => {
            context.postMessage(testMessage1);
            context.postMessage(testMessage2);
        });

        retranslator = createRetranslator({
            name: 'test-retranslator'
        });

        targetActor = createActor('target', (context: ActorContext) => {
            context.addEventListener('message', (event) => {
                receivedMessages.push(event.data);
            });
        });

        const disconnect1 = connectActors(sourceActor, retranslator);
        const disconnect2 = connectActors(retranslator, targetActor);
        disconnectFunctions.push(disconnect1, disconnect2);

        targetActor.launch();
        retranslator.launch();
        sourceActor.launch();

        await new Promise(resolve => setTimeout(resolve, 100));

        expect(receivedMessages).toHaveLength(2);
        expect(receivedMessages[0]).toEqual(testMessage1);
        expect(receivedMessages[1]).toEqual(testMessage2);
    });

    it('should forward different types of data correctly with connectActors', async () => {
        const receivedData: any[] = [];

        const testData = [
            'simple string',
            42,
            { complex: { nested: { object: true } } },
            [1, 2, 3, 'array', { mixed: 'data' }],
            null,
            undefined,
            true,
            false
        ];

        sourceActor = createActor('data-source', (context: ActorContext) => {
            testData.forEach(data => {
                context.postMessage(data);
            });
        });

        retranslator = createRetranslator();

        targetActor = createActor('data-collector', (context: ActorContext) => {
            context.addEventListener('message', (event) => {
                receivedData.push(event.data);
            });
        });

        const disconnect1 = connectActors(sourceActor, retranslator);
        const disconnect2 = connectActors(retranslator, targetActor);
        disconnectFunctions.push(disconnect1, disconnect2);

        targetActor.launch();
        retranslator.launch();
        sourceActor.launch();

        await new Promise(resolve => setTimeout(resolve, 100));

        expect(receivedData).toHaveLength(testData.length);
        testData.forEach((expectedData, index) => {
            expect(receivedData[index]).toEqual(expectedData);
        });
    });

    it('should work in complex actor networks with bidirectional communication', async () => {
        const actor1Messages: any[] = [];
        const actor2Messages: any[] = [];

        const actor1 = createActor('actor1', (context: ActorContext) => {
            context.addEventListener('message', (event) => {
                actor1Messages.push({ ...event.data, receivedBy: 'actor1' });
                if (event.data.type === 'ping') {
                    context.postMessage({ type: 'pong', from: 'actor1', replyTo: event.data });
                }
            });
            context.postMessage({ type: 'ping', message: 'Hello from actor1', id: 1 });
        });

        const actor2 = createActor('actor2', (context: ActorContext) => {
            context.addEventListener('message', (event) => {
                actor2Messages.push({ ...event.data, receivedBy: 'actor2' });
                if (event.data.type === 'ping') {
                    context.postMessage({ type: 'pong', from: 'actor2', replyTo: event.data });
                }
            });
            context.postMessage({ type: 'ping', message: 'Hello from actor2', id: 2 });
        });

        retranslator = createRetranslator({
            name: 'network-hub'
        });

        actor1.launch();
        actor2.launch();
        retranslator.launch();

        const disconnect1 = connectActors(actor1, retranslator);
        const disconnect2 = connectActors(retranslator, actor2);
        const disconnect3 = connectActors(actor2, retranslator);
        const disconnect4 = connectActors(retranslator, actor1);

        disconnectFunctions.push(disconnect1, disconnect2, disconnect3, disconnect4);

        actor1.postMessage({ type: 'ping', message: 'Hello from actor1', id: 1 });
        actor2.postMessage({ type: 'ping', message: 'Hello from actor2', id: 2 });

        await new Promise(resolve => setTimeout(resolve, 200));

        expect(actor1Messages).toContainEqual(
            expect.objectContaining({
                type: 'pong',
                from: 'actor2',
                receivedBy: 'actor1'
            })
        );

        expect(actor2Messages).toContainEqual(
            expect.objectContaining({
                type: 'pong',
                from: 'actor1',
                receivedBy: 'actor2'
            })
        );

        actor1.close();
        actor2.close();
    });
});