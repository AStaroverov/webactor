import { catchError, EMPTY, filter, mergeMap, Observable, retry, tap } from 'rxjs';
import { createErrorEnvelope } from '../errorEnvelope';
import { getThreadBySubscription$ } from '../subscriptionRegistry/registry';
import { AnyEnvelope } from '../types';
import { getErrorMessage } from '../utils/Error';
import { fromMessagePortLike } from '../utils/rx';
import { createThreadDispatch } from './dispatch';
import { regThreadId } from './threadsRegistry/registry';
import { isRegEnvelope } from './utils';

const context = globalThis as unknown as SharedWorkerGlobalScope;

context.addEventListener('connect', (event) => {
    const port = event.ports[0];
    const source$ = fromMessagePortLike<AnyEnvelope, MessageEvent>(port);

    const regEnvelope$ = source$.pipe(filter((envelope) => isRegEnvelope(envelope)));
    const normalEnvelope$: Observable<AnyEnvelope> = source$.pipe(filter((envelope) => !isRegEnvelope(envelope)));

    regEnvelope$.pipe(
        tap((envelope) => {
            const port = envelope.event.ports[0];
            regThreadId(envelope.threadId, port);
        }),
        tap({ error: (err) => console.error(getErrorMessage(err)) }),
        retry()
    ).subscribe();

    normalEnvelope$
        .pipe(
            mergeMap((envelope) =>
                getThreadBySubscription$(envelope.type).pipe(
                    mergeMap((targetFrameId) => createThreadDispatch(targetFrameId)(envelope)),
                    catchError((err) => {
                        createThreadDispatch(envelope.threadId)(createErrorEnvelope(getErrorMessage(err.message)));
                        return EMPTY;
                    }),
                ),
            ),
            tap({ error: (err) => console.error(getErrorMessage(err)) }),
            retry()
        )
        .subscribe();
});

