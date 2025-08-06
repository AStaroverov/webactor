import { distinctUntilChanged, map, mergeMap, Observable, of, shareReplay, switchMap, timer } from 'rxjs';
import { fromPromise } from 'rxjs/internal/observable/innerFrom';
import { dispatch } from '../pubsub/dispatch';
import { Message, MessagePortLike } from '../types';
import { theadLock } from '../utils/thread';
import { createRegEnvelope } from './utils';

// TODO: instead pooling use subscription on statechange
export const serviceWorker$: Observable<null | ServiceWorker> = timer(0, 100).pipe(
    map(() => (navigator.serviceWorker.controller?.state === 'activated' ? navigator.serviceWorker.controller : null)),
    distinctUntilChanged(),
    switchMap((sw): Observable<null | ServiceWorker> => {
        return sw
            ? fromPromise(theadLock).pipe(
                mergeMap(() => dispatch(sw as MessagePortLike<Message, MessageEvent>, createRegEnvelope())),
                map(() => sw),
            )
            : of(null);
    }),
    shareReplay(1),
);
