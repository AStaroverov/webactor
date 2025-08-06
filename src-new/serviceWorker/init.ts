import { catchError, EMPTY, filter, mergeMap, Observable, retry, shareReplay, tap } from 'rxjs';
import { createErrorEnvelope } from '../errorEnvelope';
import { loggerProvider } from '../providers';
import { getThreadBySubscription$ } from '../subscriptionRegistry/registry';
import { AnyEnvelope } from '../types';
import { isObject } from '../utils/common';
import { getErrorMessage } from '../utils/Error';
import { fromServiceWorkerGlobalScope } from '../utils/rx';
import { createThreadDispatch } from './dispatch';
import { regThreadId } from './threadsRegistry/registry';
import { isRegEnvelope } from './utils';

export function initSupervisor() {
    const source$ = fromServiceWorkerGlobalScope().pipe(
        shareReplay(1),
        tap({
            error: (err) => loggerProvider.error(getErrorMessage(err)),
        }),
        retry({ delay: 1000 }),
    );

    const regEnvelope$ = source$.pipe(filter((envelope) => isRegEnvelope(envelope)));
    const normalEnvelope$: Observable<AnyEnvelope> = source$.pipe(filter((envelope) => !isRegEnvelope(envelope)));

    const subSub = regEnvelope$.subscribe((envelope) => {
        const source = envelope.event.source;

        if (isObject(source) && 'id' in source) {
            regThreadId(envelope.threadId, source.id);
        } else {
            loggerProvider.info('Message without source id', source);
        }
    });

    const normSub = normalEnvelope$
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
        )
        .subscribe();

    return () => {
        subSub.unsubscribe();
        normSub.unsubscribe();
    };
}
