import { createActor } from '../../../../src/createActor';
import { createEnvelope } from '../../../../src/envelope';
import { MINMAX_ACTION_TYPE, MINMAX_RESULT_TYPE, TMinMaxActionEnvelope, TMinMaxResultEnvelope } from './defs';

export function createActorMinMax() {
    return createActor<TMinMaxActionEnvelope, TMinMaxResultEnvelope>('MIN_MAX', ({ subscribe, dispatch }) => {
        subscribe((envelope) => {
            if (envelope.type === MINMAX_ACTION_TYPE) {
                const result = new Float64Array([Math.min(...envelope.payload), Math.max(...envelope.payload)]);
                dispatch(createEnvelope(MINMAX_RESULT_TYPE, result, [result.buffer]));
            }
        });
    });
}
