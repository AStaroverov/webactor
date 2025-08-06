import { from, fromEvent, mergeMap, Observable, Subject, takeUntil, tap, timer } from 'rxjs';
import { lock, subscribeOnUnlock$ } from './Locks';
import { fromPromise } from 'rxjs/internal/observable/innerFrom';

export function createAliveRegistry$<T extends string>(
    channelName: string,
    extractValue: (event: MessageEvent) => undefined | T,
) {
    const registryChannel = new BroadcastChannel(channelName);
    const availableEntities = new Set<T>();
    const destroy$ = new Subject<void>();
    const newEntity$ = new Subject<T>();
    const brokenEntity$ = new Subject<T>();

    fromEvent<MessageEvent>(registryChannel, 'message')
        .pipe(takeUntil(destroy$))
        .subscribe((event: MessageEvent) => {
            const entity = extractValue(event.data);
            if (entity === undefined || availableEntities.has(entity)) return;
            availableEntities.add(entity);
            newEntity$.next(entity);
        });

    newEntity$.pipe(mergeMap(subscribeOnUnlock$), takeUntil(destroy$)).subscribe((entity: T) => {
        availableEntities.delete(entity);
        brokenEntity$.next(entity);
    });

    const alive$ = (ent: T): Observable<unknown> => {
        return fromPromise(lock(ent)).pipe(
            mergeMap(() => timer(0, 300)),
            tap(() => registryChannel.postMessage(ent)),
            takeUntil(destroy$),
        );
    };

    const getAlive$ = (matcher: (e: T) => boolean): Observable<T> => {
        const existed = Array.from(availableEntities).filter(matcher);
        return from(existed);
    };

    return {
        alive$,
        getAlive$,
        destroy: () => {
            destroy$.next();
            destroy$.complete();
        },
    };
}
