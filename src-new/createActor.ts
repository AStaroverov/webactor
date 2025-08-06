import { EMPTY, filter, merge, mergeMap, of, switchMap, tap, throwError, timeout } from 'rxjs';
import { dispatch } from './pubsub/dispatch';
import { serviceWorker$ } from './serviceWorker/sw';
import { isRegisteredInOtherThreadId$, isRegisteredInThreadId$ } from './subscriptionRegistry/registry';
import { Actor, ActorContext, AnyEnvelope, Dispatch$, Envelope, Subscribe$ } from './types';
import { Err, ErrCode } from './utils/Error';
import { fromServiceWorker } from './utils/rx';
import { threadId } from './utils/thread';

type ActorConstructor<In extends AnyEnvelope, Out extends AnyEnvelope> = (
    context: ActorContext<In, Out>,
) => unknown | VoidFunction;

export function createActor<In extends Envelope<any, any>, Out extends Envelope<any, any>>(
    name: string,
    constructor: ActorConstructor<In, Out>,
): Actor<In, Out> {
    let disposes: VoidFunction[] = [];

    const actorDispatchTimeout = timeout({
        first: 10_000,
        with: () => throwError(() => new Err(ErrCode.Timeout, `Dispatch timeout for envelope`)),
    });
    const actorDispatch: Dispatch$<Out> = (envelope: Out) => {
        return of(true).pipe(
            mergeMap(() => {
                console.log('>>', envelope);
                return dispatch(serviceWorker$, envelope);
            }),
        ).pipe(actorDispatchTimeout);
        return merge(
            isRegisteredInThreadId$(envelope.type, threadId).pipe(
                tap(() => {
                    console.log('current thread dispatch', envelope);
                }),
            ),
            isRegisteredInOtherThreadId$(envelope.type, threadId).pipe(
                mergeMap(() => {
                    console.log('>>', envelope);
                    return dispatch(serviceWorker$, envelope);
                }),
            ),
        ).pipe(actorDispatchTimeout);
    };
    const actorSubscribe: Subscribe$<In> = (type) => {
        return serviceWorker$.pipe(
            switchMap((sw) => {
                // TODO: timeout on service worker null?
                return sw == null ? EMPTY : fromServiceWorker<In>(sw);
            }),
            filter((e) => e.type === type),
        );
    };

    const actorContext = {
        name,
        dispatch: actorDispatch,
        subscribe: actorSubscribe,
    };

    const launch = () => {
        const dispose = constructor(actorContext);
        typeof dispose === 'function' && disposes.push(dispose as VoidFunction);
        return actor;
    };

    const destroy = () => {
        disposes.forEach((dispose) => typeof dispose === 'function' && dispose());
    };

    const actor = {
        name,
        launch,
        destroy,
    };

    return actor;
}
