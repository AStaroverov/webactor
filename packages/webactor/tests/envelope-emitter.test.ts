import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { connectTransmitters } from '../src/connectTransmitters';
import { createEnvelopeEmitter } from '../src/createEnvelopeEmitter';
import { createEnvelopeChannel } from '../src/createEnvelopePort';
import { createEnvelope, EnvelopeType } from '../src/envelope';
import { loggerProvider } from '../src/providers';
import { Reasons } from '../src/reason';
import { request } from '../src/request/request';
import { response } from '../src/request/response';
import { Transmitter } from '../src/types';
import { MockMessageChannel } from './message-channel-mock';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const settle = async () => {
    await tick();
    await tick();
};

describe('undelivered messages and failing listeners', () => {
    let uncaught: unknown[];
    let rejections: unknown[];
    let logged: unknown[];
    let ownHandlers: { uncaught: NodeJS.UncaughtExceptionListener; rejection: (reason: unknown) => void };
    let hostHandlers: NodeJS.UncaughtExceptionListener[];

    beforeEach(() => {
        uncaught = [];
        rejections = [];
        logged = [];
        loggerProvider.delegate = { error: (...args: unknown[]) => logged.push(args[0]) };
        ownHandlers = {
            uncaught: (error: Error) => uncaught.push(error),
            rejection: (reason: unknown) => rejections.push(reason),
        };
        hostHandlers = process.listeners('uncaughtException');
        process.removeAllListeners('uncaughtException');
        process.on('uncaughtException', ownHandlers.uncaught);
        process.on('unhandledRejection', ownHandlers.rejection);
    });

    afterEach(() => {
        loggerProvider.delegate = undefined;
        process.off('uncaughtException', ownHandlers.uncaught);
        process.off('unhandledRejection', ownHandlers.rejection);
        for (const handler of hostHandlers) process.on('uncaughtException', handler);
    });

    it('should keep dispatching to the remaining listeners when one throws', async () => {
        const emitter = createEnvelopeEmitter();
        const received: unknown[] = [];

        emitter.addEventListener('message', () => {
            throw new Error('listener exploded');
        });
        emitter.addEventListener('message', (envelope: any) => received.push(envelope.data));

        emitter.postMessage({ hello: 'world' });
        await settle();

        expect(received).toEqual([{ hello: 'world' }]);
        expect(rejections).toHaveLength(0);
        expect(uncaught).toHaveLength(1);
        expect((uncaught[0] as Error).message).toBe('listener exploded');
    });

    it('should rethrow a rejected async listener instead of leaving it unhandled', async () => {
        const emitter = createEnvelopeEmitter();

        emitter.addEventListener('message', async () => {
            throw new Error('async listener exploded');
        });

        emitter.postMessage({ hello: 'world' });
        await settle();

        expect(rejections).toHaveLength(0);
        expect(uncaught).toHaveLength(1);
        expect((uncaught[0] as Error).message).toBe('async listener exploded');
    });

    it('should report an undeliverable envelope back to the sender as messageerror', async () => {
        const local = createEnvelopeChannel();
        let attempts = 0;
        const broken = {
            name: 'broken',
            postMessage: () => {
                attempts += 1;
                throw new Error('An object could not be cloned.');
            },
            addEventListener: () => {},
            removeEventListener: () => {},
        };
        const disconnect = connectTransmitters(local.port1 as unknown as Transmitter, broken as Transmitter);

        const failures: any[] = [];
        local.port2.addEventListener(EnvelopeType.MessageError, (envelope: any) => failures.push(envelope));

        local.port2.postMessage({ hello: 'world' });
        await settle();

        expect(uncaught).toHaveLength(0);
        expect(rejections).toHaveLength(0);
        expect(failures).toHaveLength(1);
        expect(failures[0].type).toBe(EnvelopeType.MessageError);
        expect(failures[0].data).toBeInstanceOf(Error);
        expect(failures[0].data.message).toBe('An object could not be cloned.');
        expect(attempts).toBe(1);

        local.port2.postMessage({ hello: 'again' });
        await settle();

        expect(failures).toHaveLength(2);
        expect(attempts).toBe(2);

        disconnect();
    });

    it('should turn a native messageerror into a messageerror envelope for the local endpoint', async () => {
        const native = new MockMessageChannel();
        const local = createEnvelopeChannel();
        const disconnect = connectTransmitters(
            native.port1 as unknown as Transmitter,
            local.port1 as unknown as Transmitter,
        );

        const failures: any[] = [];
        local.port2.addEventListener(EnvelopeType.MessageError, (envelope: any) => failures.push(envelope));

        native.port1.dispatchEvent(new MessageEvent('messageerror', { data: null }));
        await settle();

        expect(uncaught).toHaveLength(0);
        expect(failures).toHaveLength(1);
        expect(failures[0].type).toBe(EnvelopeType.MessageError);
        expect(failures[0].data).toBeInstanceOf(Error);
        expect(failures[0].data.message).toBe(Reasons.Undeserializable);

        disconnect();
    });

    it('should carry the report along the route so a pending request rejects at once', async () => {
        const native = new MockMessageChannel();
        const local = createEnvelopeChannel();
        const flaky = {
            name: 'flaky',
            postMessage: (data: any) => {
                if (data?.data?.poison === true) throw new Error('An object could not be cloned.');
                native.port1.postMessage(data);
            },
            addEventListener: native.port1.addEventListener,
            removeEventListener: native.port1.removeEventListener,
        };
        const disconnect = connectTransmitters(flaky as Transmitter, local.port1 as unknown as Transmitter);

        local.port2.addEventListener('message', (envelope: any) => {
            response(local.port2 as unknown as Transmitter, envelope, { poison: true });
        });

        await expect(request(native.port2 as unknown as Transmitter, { hello: 'world' })).rejects.toThrow(
            'An object could not be cloned.',
        );
        expect(uncaught).toHaveLength(0);
        expect(logged).toHaveLength(0);

        disconnect();
    });

    it('should log when even the report cannot be handed over', async () => {
        const native = new MockMessageChannel();
        const broken = {
            name: 'broken',
            postMessage: () => {
                throw new Error('port is gone');
            },
            addEventListener: () => {},
            removeEventListener: () => {},
        };
        const disconnect = connectTransmitters(native.port1 as unknown as Transmitter, broken as Transmitter);

        native.port1.dispatchEvent(new MessageEvent('messageerror', { data: null }));
        await settle();

        expect(uncaught).toHaveLength(0);
        expect(rejections).toHaveLength(0);
        expect(logged).toHaveLength(1);
        expect((logged[0] as Error).message).toBe('port is gone');

        disconnect();
    });

    it('should not relay a messageerror envelope any further', async () => {
        const native = new MockMessageChannel();
        const local = createEnvelopeChannel();
        const disconnect = connectTransmitters(
            native.port1 as unknown as Transmitter,
            local.port1 as unknown as Transmitter,
        );

        const forwarded: any[] = [];
        native.port2.addEventListener('message', (event: MessageEvent) => forwarded.push(event.data));

        local.port2.postMessage(createEnvelope(EnvelopeType.MessageError, new Error('local only')));
        await settle();

        expect(forwarded).toHaveLength(0);

        disconnect();
    });

    it('should fall back to the Undeliverable reason when the target throws a non-error', async () => {
        const local = createEnvelopeChannel();
        const broken = {
            name: 'broken',
            postMessage: () => {
                throw undefined;
            },
            addEventListener: () => {},
            removeEventListener: () => {},
        };
        const disconnect = connectTransmitters(local.port1 as unknown as Transmitter, broken as Transmitter);

        const failures: any[] = [];
        local.port2.addEventListener(EnvelopeType.MessageError, (envelope: any) => failures.push(envelope));

        local.port2.postMessage({ hello: 'world' });
        await settle();

        expect(failures).toHaveLength(1);
        expect(failures[0].data).toBeInstanceOf(Error);
        expect(failures[0].data.message).toBe(Reasons.Undeliverable);

        disconnect();
    });
});
