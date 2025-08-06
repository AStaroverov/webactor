import { map, Observable, take } from 'rxjs';
import { ThreadId } from '../types';
import { createAliveRegistry$ } from '../utils/AliveRegistry';
import { threadId } from '../utils/thread';

type RegData = {
    type: string;
    threadId: ThreadId;
};
const isRegEnvelope = (data: unknown): data is RegData => {
    return typeof data === 'object' && data !== null && 'type' in data && 'threadId' in data;
};
const subscriptionRegistry = createAliveRegistry$('threadsRegistry', (event) =>
    isRegEnvelope(event.data) ? `${event.data.threadId}/${event.data.type}` : undefined,
);

export const registerSubscription$ = (type: string) => {
    return subscriptionRegistry.alive$(`${threadId}/${type}`);
};

export const isRegisteredInThreadId$ = (type: string, threadId: string) => {
    return subscriptionRegistry.getAlive$((key) => key === `${threadId}/${type}`).pipe(map(() => true));
};
export const isRegisteredInOtherThreadId$ = (type: string, threadId: string) => {
    return subscriptionRegistry
        .getAlive$((key) => !key.startsWith(threadId + '/') && key.endsWith('/' + type))
        .pipe(
            take(1),
            map(() => true),
        );
};

export const getThreadBySubscription$ = (type: string): Observable<ThreadId> => {
    return subscriptionRegistry.getAlive$((key) => key.endsWith('/' + type)).pipe(map((key) => key.split('/')[0]), take(1));
};
