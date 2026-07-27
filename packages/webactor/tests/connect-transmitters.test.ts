import { describe, expect, it } from 'vitest';

import { connectTransmitters } from '../src/connectTransmitters';
import { createEnvelopeChannel } from '../src/createEnvelopePort';
import { createEnvelope, EnvelopeType } from '../src/envelope';
import { Transmitter } from '../src/types';
import { MockMessageChannel } from './message-channel-mock';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('connectTransmitters over native-like ports', () => {
    it('should preserve envelope type when it crosses a native message port', async () => {
        const native = new MockMessageChannel();
        const local = createEnvelopeChannel();
        const disconnect = connectTransmitters(
            native.port1 as unknown as Transmitter,
            local.port1 as unknown as Transmitter,
            [EnvelopeType.Message, EnvelopeType.Close],
        );

        const closeEnvelopes: any[] = [];
        const messageEnvelopes: any[] = [];
        // @ts-ignore
        local.port2.addEventListener('close', (envelope: any) => closeEnvelopes.push(envelope));
        local.port2.addEventListener('message', (envelope: any) => messageEnvelopes.push(envelope));

        native.port2.postMessage(createEnvelope(EnvelopeType.Close, { reason: 'peer closed' }));
        await tick();

        expect(messageEnvelopes).toHaveLength(0);
        expect(closeEnvelopes).toHaveLength(1);
        expect(closeEnvelopes[0].type).toBe(EnvelopeType.Close);
        expect(closeEnvelopes[0].data).toEqual({ reason: 'peer closed' });

        disconnect();
    });

    it('should drop envelopes whose type is not connected', async () => {
        const native = new MockMessageChannel();
        const local = createEnvelopeChannel();
        const disconnect = connectTransmitters(
            native.port1 as unknown as Transmitter,
            local.port1 as unknown as Transmitter,
        );

        const received: any[] = [];
        local.port2.addEventListener('message', (envelope: any) => received.push(envelope));
        // @ts-ignore
        local.port2.addEventListener('close', (envelope: any) => received.push(envelope));

        native.port2.postMessage(createEnvelope(EnvelopeType.Close, { reason: 'peer closed' }));
        await tick();
        expect(received).toHaveLength(0);

        native.port2.postMessage(createEnvelope(EnvelopeType.Message, { hello: 'world' }));
        await tick();
        expect(received).toHaveLength(1);
        expect(received[0].type).toBe(EnvelopeType.Message);
        expect(received[0].data).toEqual({ hello: 'world' });

        disconnect();
    });

    it('should forward raw (non-envelope) native messages as message envelopes', async () => {
        const native = new MockMessageChannel();
        const local = createEnvelopeChannel();
        const disconnect = connectTransmitters(
            native.port1 as unknown as Transmitter,
            local.port1 as unknown as Transmitter,
        );

        const received: any[] = [];
        local.port2.addEventListener('message', (envelope: any) => received.push(envelope));

        native.port2.postMessage({ plain: 'data' });
        await tick();

        expect(received).toHaveLength(1);
        expect(received[0].type).toBe(EnvelopeType.Message);
        expect(received[0].data).toEqual({ plain: 'data' });

        disconnect();
    });
});
