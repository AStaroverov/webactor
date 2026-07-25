import { describe, it, expect, afterEach } from 'vitest';
import { ActorContext, createActor, createDenseNetwork } from '../src/index';

describe('Dense Network Tests', () => {
    let network: any;

    afterEach(async () => {
        try {
            if (network) {
                network.close();
                network = null;
            }
        } catch (error) {
            console.warn('Cleanup error (ignoring):', error);
        }
    });

    it('should create dense network and connect all actors each other', async () => {
        const actor1Messages: any[] = [];
        const actor2Messages: any[] = [];
        const actor3Messages: any[] = [];

        const actor1 = createActor('node1', (context: ActorContext) => {
            context.addEventListener('message', (event) => {
                actor1Messages.push({ ...event.data, receivedBy: 'node1' });
            });
            context.postMessage({ type: 'hello', from: 'node1', message: 'Hello from node1!' });
        });

        const actor2 = createActor('node2', (context: ActorContext) => {
            context.addEventListener('message', (event) => {
                actor2Messages.push({ ...event.data, receivedBy: 'node2' });
            });
            context.postMessage({ type: 'hello', from: 'node2', message: 'Hello from node2!' });
        });

        const actor3 = createActor('node3', (context: ActorContext) => {
            context.addEventListener('message', (event) => {
                actor3Messages.push({ ...event.data, receivedBy: 'node3' });
            });
            context.postMessage({ type: 'hello', from: 'node3', message: 'Hello from node3!' });
        });

        network = createDenseNetwork(actor1, actor2, actor3);
        network.launch();

        await new Promise((resolve) => setTimeout(resolve, 200));

        expect(actor1Messages).toHaveLength(2);
        expect(actor2Messages).toHaveLength(2);
        expect(actor3Messages).toHaveLength(2);

        expect(actor1Messages).toContainEqual(expect.objectContaining({ from: 'node2', receivedBy: 'node1' }));
        expect(actor1Messages).toContainEqual(expect.objectContaining({ from: 'node3', receivedBy: 'node1' }));

        expect(actor2Messages).toContainEqual(expect.objectContaining({ from: 'node1', receivedBy: 'node2' }));
        expect(actor2Messages).toContainEqual(expect.objectContaining({ from: 'node3', receivedBy: 'node2' }));

        expect(actor3Messages).toContainEqual(expect.objectContaining({ from: 'node1', receivedBy: 'node3' }));
        expect(actor3Messages).toContainEqual(expect.objectContaining({ from: 'node2', receivedBy: 'node3' }));
    });

    it('should handle two-node network', async () => {
        const node1Messages: any[] = [];
        const node2Messages: any[] = [];

        const node1 = createActor('peer1', (context: ActorContext) => {
            context.addEventListener('message', (event) => {
                node1Messages.push(event.data);
            });
            context.postMessage({ type: 'ping', from: 'peer1' });
        });

        const node2 = createActor('peer2', (context: ActorContext) => {
            context.addEventListener('message', (event) => {
                node2Messages.push(event.data);
            });
            context.postMessage({ type: 'pong', from: 'peer2' });
        });

        network = createDenseNetwork(node1, node2);
        network.launch();

        await new Promise((resolve) => setTimeout(resolve, 150));

        expect(node1Messages).toHaveLength(1);
        expect(node2Messages).toHaveLength(1);

        expect(node1Messages).toContainEqual({ type: 'pong', from: 'peer2' });

        expect(node2Messages).toContainEqual({ type: 'ping', from: 'peer1' });
    });

    it('should support interactive messaging after launch', async () => {
        const receivedMessages: any[] = [];

        const listener = createActor('listener', (context: ActorContext) => {
            context.addEventListener('message', (event) => {
                receivedMessages.push(event.data);
            });
        });

        let senderContext: ActorContext | null = null;
        const sender = createActor('sender', (context: ActorContext) => {
            senderContext = context;
        });

        network = createDenseNetwork(listener, sender);
        network.launch();

        await new Promise((resolve) => setTimeout(resolve, 50));

        senderContext!.postMessage({ type: 'runtime', message: 'Runtime message 1' });
        senderContext!.postMessage({ type: 'runtime', message: 'Runtime message 2' });

        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(receivedMessages).toHaveLength(2);
        expect(receivedMessages[0]).toEqual({ type: 'runtime', message: 'Runtime message 1' });
        expect(receivedMessages[1]).toEqual({ type: 'runtime', message: 'Runtime message 2' });
    });

    it('should throw error when no transmitters provided', () => {
        expect(() => {
            createDenseNetwork();
        }).toThrow('At least one transmitter is required to create dense network');
    });
});
