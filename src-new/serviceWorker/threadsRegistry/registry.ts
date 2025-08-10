import { first, map, Observable, of, Subject } from 'rxjs';
import { ThreadId } from '../../types';
import { subscribeOnUnlock } from '../../utils/Locks';

export const mapThreadIdToClientId = new Map<ThreadId, MessagePort>();
export const regThreadId$ = new Subject<{ threadId: ThreadId; port: MessagePort }>();

regThreadId$.subscribe(({ threadId, port }) => {
    mapThreadIdToClientId.set(threadId, port);
    subscribeOnUnlock(threadId, () => {
        mapThreadIdToClientId.delete(threadId);
    });
});

export const regThreadId = (threadId: ThreadId, port: MessagePort) => regThreadId$.next({ threadId, port });

export const getClientId$ = (threadId: ThreadId): Observable<MessagePort> =>
    mapThreadIdToClientId.has(threadId)
        ? of(mapThreadIdToClientId.get(threadId)!)
        : regThreadId$.pipe(
            first((props) => threadId === props.threadId),
            map((v) => v.port),
        );
