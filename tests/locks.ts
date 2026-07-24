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

locksProvider.delegate = {
    query: () => locks.query(),
    request(name: string, optionsOrCallback: any, callback?: any) {
        if (typeof optionsOrCallback === 'function') {
            return locks.request(name, optionsOrCallback);
        }
        const { signal, ...options } = optionsOrCallback ?? {};
        return locks.request(
            name,
            signal ? { ...options, signal: adaptSignal(signal) } : options,
            callback,
        );
    },
} as unknown as LockManager;
