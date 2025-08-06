import { createShortRandomString } from './common';
import { isDedicatedWorkerScope, isSharedWorkerScope, isWindowScope } from './detect';
import { lock } from './Locks';

export const threadName = isSharedWorkerScope(globalThis)
    ? `${self.name}(sharedWorker)`
    : isDedicatedWorkerScope(globalThis)
    ? `${self.name}(dedicatedWorker)`
    : isWindowScope(globalThis)
    ? 'window'
    : 'unknown';

export const threadId = `${threadName}[${createShortRandomString()}]`;

export const theadLock = lock(threadId);
