import { DBSchema, openDB } from 'idb';

const version = 1;
const name = 'WebActorDB';
export const StoreNames = {
    Threads: 'Threads',
    Actors: 'Actors',
    Subscriptions: 'Subscriptions',
} as const;

type WebActorDB = DBSchema & {
    [StoreNames.Subscriptions]: {
        key: string;
        value: { threads: string[] };
        indexes: { 'by-thread': string };
    };
    [StoreNames.Threads]: {
        key: string; // uuid
        value: { lastSeen: number }; // unix-ms
        indexes: { 'by-lastSeen': number };
    };
};

export const db = await openDB<WebActorDB>(name, version, {
    upgrade(db, oldVersion, newVersion, transaction, event) {
        if (!db.objectStoreNames.contains(StoreNames.Subscriptions)) {
            const store = db.createObjectStore(StoreNames.Subscriptions, { keyPath: 'id' });
            store.createIndex('by-thread', 'threads', { multiEntry: true });
        }
        if (!db.objectStoreNames.contains(StoreNames.Threads)) {
            const t = db.createObjectStore(StoreNames.Threads);
            t.createIndex('by-lastSeen', 'lastSeen');
        }
    },
    blocked(currentVersion, blockedVersion, event) {
        // …
    },
    blocking(currentVersion, blockedVersion, event) {
        // …
    },
    terminated() {
        // …
    },
});
