import './locks';

import { describe, expect, it, jest } from '@jest/globals';
import { createMailbox } from '../examples/common/actors/createActor';
import {
    connectActorToActor,
    createActorFactory,
    createEnvelope,
    createRequest,
    createResponseFactory,
    Envelope,
    UnknownEnvelope,
} from '../src';

export const REQUEST_TYPE = 'REQUEST_TYPE' as const;
export type TReqEnvelope = Envelope<typeof REQUEST_TYPE, undefined>;
export const RESPONSE_TYPE = 'RESPONSE_TYPE' as const;
export type TResEnvelope = Envelope<typeof RESPONSE_TYPE, number>;

describe(`Request`, () => {
    const createActor = createActorFactory({ getMailbox: createMailbox });

    it(`request + response`, () => {
        const onResponse = jest.fn((envelope: UnknownEnvelope) => {
            expect(envelope.type).toEqual(RESPONSE_TYPE);
        });
        const ac1 = createActor<UnknownEnvelope, TReqEnvelope>(`A1`, (context) => {
            const request = createRequest(context);
            request(createEnvelope(REQUEST_TYPE, undefined)).then(onResponse);
        });

        const ac2 = createActor<TReqEnvelope, TResEnvelope | Envelope<'spam', unknown>>(
            `A2`,
            ({ postMessage, addEventListener }) => {
                const createResponse = createResponseFactory(postMessage);

                postMessage(createEnvelope('spam', null));

                addEventListener('message', (event) => {
                    if (event.type === REQUEST_TYPE) {
                        const response = createResponse(event.data);

                        postMessage(createEnvelope('spam', null));
                        response(createEnvelope(RESPONSE_TYPE, 1));
                        postMessage(createEnvelope('spam', null));
                        response(createEnvelope(RESPONSE_TYPE, 1));
                    }
                });
            },
        );

        connectActorToActor(ac1, ac2);

        ac2.launch();
        ac1.launch();

        expect(onResponse.mock.calls).toHaveLength(2);
    });

    it(`request + multi response`, () => {
        const onResponse = jest.fn();
        const ac1 = createActor<UnknownEnvelope, TReqEnvelope>(`A1`, (context) => {
            const request = createRequest(context);
            request(createEnvelope(REQUEST_TYPE, undefined)).then(onResponse);
        });

        const ac2 = createActor<TReqEnvelope, TResEnvelope | Envelope<'spam', unknown>>(
            `A2`,
            ({ postMessage, addEventListener }) => {
                const createResponse = createResponseFactory(postMessage);

                postMessage(createEnvelope('spam', null));

                addEventListener('message', (event) => {
                    if (event.type === REQUEST_TYPE) {
                        const response = createResponse(event.data);

                        postMessage(createEnvelope('spam', null));
                        response(createEnvelope(RESPONSE_TYPE, 1));
                        postMessage(createEnvelope('spam', null));
                        response(createEnvelope(RESPONSE_TYPE, 1));
                    }
                });
            },
        );
        const ac3 = createActor<TReqEnvelope, TResEnvelope | Envelope<'spam', unknown>>(
            `A3`,
            ({ postMessage, addEventListener }) => {
                const createResponse = createResponseFactory(postMessage);

                postMessage(createEnvelope('spam', null));

                addEventListener('message', (event) => {
                    if (event.type === REQUEST_TYPE) {
                        const response = createResponse(event.data);

                        postMessage(createEnvelope('spam', null));
                        response(createEnvelope(RESPONSE_TYPE, 2));
                        postMessage(createEnvelope('spam', null));
                        response(createEnvelope(RESPONSE_TYPE, 2));
                    }
                });
            },
        );

        connectActorToActor(ac1, ac2);
        connectActorToActor(ac1, ac3);

        ac2.launch();
        ac3.launch();
        ac1.launch();

        expect(onResponse.mock.calls).toHaveLength(4);
        expect(onResponse.mock.calls[0][0]).toHaveProperty('payload', 1);
        expect(onResponse.mock.calls[1][0]).toHaveProperty('payload', 1);
        expect(onResponse.mock.calls[2][0]).toHaveProperty('payload', 2);
        expect(onResponse.mock.calls[3][0]).toHaveProperty('payload', 2);
    });
});
