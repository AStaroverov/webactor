import { ThreadId } from '../../types';
import { first, map, Observable, of, Subject } from 'rxjs';
import { ClientId } from '../defs';
import { subscribeOnUnlock } from '../../utils/Locks';

export const mapThreadIdToClientId = new Map<ThreadId, ClientId>();
export const regThreadId$ = new Subject<{ threadId: ThreadId; clientId: ClientId }>();

regThreadId$.subscribe(({ threadId, clientId }) => {
    mapThreadIdToClientId.set(threadId, clientId);
    subscribeOnUnlock(threadId, () => {
        mapThreadIdToClientId.delete(threadId);
    });
});

export const regThreadId = (threadId: ThreadId, clientId: ClientId) => regThreadId$.next({ threadId, clientId });

export const getClientId$ = (threadId: ThreadId): Observable<ClientId> =>
    mapThreadIdToClientId.has(threadId)
        ? of(mapThreadIdToClientId.get(threadId)!)
        : regThreadId$.pipe(
              first((props) => threadId === props.threadId),
              map((v) => v.clientId),
          );
