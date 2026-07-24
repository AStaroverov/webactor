// @ts-ignore
import { locks } from 'web-locks';
import { locksProvider } from '../src/providers';

// web-locks expects an EventEmitter-like signal (`signal.on('abort', cb)`), not a native AbortSignal
function adaptSignal(signal: AbortSignal) {
    return {
        on(_type: 'abort', callback: (reason: unknown) => void) {
            const reject = () => callback(new DOMException('The request was aborted', 'AbortError'));
            if (signal.aborted) {
                queueMicrotask(reject);
            } else {
                signal.addEventListener('abort', reject, { once: true });
            }
        },
    };
}

// web-locks does not implement `ifAvailable`, emulate it by tracking held names
const heldNames = new Set<string>();

function trackHeld(name: string, callback: (lock: unknown) => unknown) {
    return async (lock: unknown) => {
        heldNames.add(name);
        try {
            return await callback(lock);
        } finally {
            heldNames.delete(name);
        }
    };
}

locksProvider.delegate = {
    query: () => locks.query(),
    request(name: string, optionsOrCallback: any, callback?: any) {
        if (typeof optionsOrCallback === 'function') {
            return locks.request(name, trackHeld(name, optionsOrCallback));
        }
        const { signal, ifAvailable, ...options } = optionsOrCallback ?? {};
        if (ifAvailable && heldNames.has(name)) {
            return Promise.resolve(callback(null));
        }
        return locks.request(
            name,
            signal ? { ...options, signal: adaptSignal(signal) } : options,
            trackHeld(name, callback),
        );
    },
} as unknown as LockManager;
