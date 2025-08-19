import { describe, expect, it, jest } from '@jest/globals';
import {
    AnyEnvelope,
    connectActorToActor,
    createActorFactory,
    createEnvelope,
    Envelope,
    UnknownEnvelope,
} from '../src';
import { createMailbox } from '../src/createActor';
import './locks';

export const NUMBER_TYPE = 'NUMBER_TYPE' as const;
export type TNumberEnvelope = Envelope<typeof NUMBER_TYPE, number>;

export const TRIGGER_TYPE = 'TRIGGER_TYPE' as const;
export type TStartEnvelope = Envelope<typeof TRIGGER_TYPE, undefined>;

describe(`Base`, () => {
    const createActor = createActorFactory({ getMailbox: createMailbox });

    it(`launch + destroy`, () => {
        const dispose = jest.fn();
        const init = jest.fn(() => dispose);
        const actor = createActor<UnknownEnvelope, TNumberEnvelope>(`Actor`, init);

        actor.launch();
        expect(init.mock.calls).toHaveLength(1);

        actor.destroy();
        expect(dispose.mock.calls).toHaveLength(1);
    });

    it(`create chain from 3 actors`, () => {
        const firstEnv = createEnvelope(NUMBER_TYPE, 1);
        const secondEnv = createEnvelope(NUMBER_TYPE, 2);
        const receivedMessages: Array<AnyEnvelope> = [];
        const ac1 = createActor<UnknownEnvelope, TNumberEnvelope>(`A1`, ({ postMessage, addEventListener }) => {
            postMessage(firstEnv);
        });

        const ac2 = createActor<TNumberEnvelope, TNumberEnvelope>(`A2`, ({ postMessage, addEventListener }) => {
            postMessage(secondEnv);
            addEventListener('message', (event) => {
                receivedMessages.push(event.data);
            });
        });

        const ac3 = createActor<TNumberEnvelope, UnknownEnvelope>(`A3`, ({ postMessage, addEventListener }) => {
            addEventListener('message', (event) => {
                event.data.type === NUMBER_TYPE && receivedMessages.push(event.data);
            });
        });

        connectActorToActor(ac1, ac2);
        connectActorToActor(ac2, ac3);

        ac3.launch();
        ac2.launch();
        ac1.launch();

        expect(receivedMessages[0].payload).toEqual(secondEnv.payload);
        expect(receivedMessages[1].payload).toEqual(firstEnv.payload);
    });

    it(`correct disconnect actors`, () => {
        const firstEnv = createEnvelope(NUMBER_TYPE, 1);
        const receivedMessages: Array<AnyEnvelope> = [];
        const ac1 = createActor<TStartEnvelope, TNumberEnvelope>(`A1`, ({ postMessage, addEventListener }) => {
            addEventListener('message', (event) => {
                event.data.type === TRIGGER_TYPE && postMessage(firstEnv);
            });
        });

        const ac2 = createActor<UnknownEnvelope, TNumberEnvelope>(`A2`, ({ postMessage, addEventListener }) => {
            addEventListener('message', (event) => {
                event.data.type === NUMBER_TYPE && receivedMessages.push(event.data);
            });
        });

        const disconnect = connectActorToActor(ac1, ac2);

        ac1.launch();
        ac2.launch();
        ac1.postMessage(createEnvelope(TRIGGER_TYPE, undefined));

        disconnect();

        ac1.postMessage(createEnvelope(TRIGGER_TYPE, undefined));

        expect(receivedMessages.length).toEqual(1);
    });
});
