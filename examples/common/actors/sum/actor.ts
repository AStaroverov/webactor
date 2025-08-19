import { createResponseFactory } from '../../../../src';
import { createActor } from '../../../../src/createActor';
import { createEnvelope } from '../../../../src/envelope';
import { SUM_ACTION_TYPE, SUM_RESULT_TYPE, TSumActionEnvelope, TSumResultEnvelope } from './defs';

export function createActorSum() {
    return createActor<TSumActionEnvelope, TSumResultEnvelope>('SUM', ({ dispatch, subscribe }) => {
        const createResponse = createResponseFactory(dispatch);

        subscribe((envelope) => {
            if (envelope.type === SUM_ACTION_TYPE) {
                const response = createResponse(envelope);

                response(
                    createEnvelope(
                        SUM_RESULT_TYPE,
                        envelope.payload.reduce((acc, v) => acc + v, 0),
                    ),
                );
            }
        });
    });
}
