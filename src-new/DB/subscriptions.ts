import { db, StoreNames } from './index';
import { ThreadId } from '../types';

export async function getAllSubs(): Promise<{ threads: ThreadId[] }[]> {
    return db.getAll(StoreNames.Subscriptions);
}

export async function getThreads(sub: string): Promise<ThreadId[] | undefined> {
    const rec = await db.get(StoreNames.Subscriptions, sub);
    return rec?.threads;
}

export async function addSubscription(sub: string, threadId: ThreadId) {
    const value = await db.get(StoreNames.Subscriptions, sub).then((rec) => {
        const threads = rec?.threads ?? [];
        if (!threads.includes(threadId)) threads.push(threadId);
        return { threads };
    });
    return db.transaction(StoreNames.Subscriptions, 'readwrite').store.put(value);
}

export async function removeSubscription(sub: string, threadId: ThreadId) {
    const store = db.transaction(StoreNames.Subscriptions, 'readwrite').store;
    const rec = await store.get(sub);
    if (!rec) return;

    rec.threads = rec.threads.filter((t) => t !== threadId);
    rec.threads.length ? await store.put(rec) : await store.delete(sub);
}
