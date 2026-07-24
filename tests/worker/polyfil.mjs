import '@apacheli/web-workers';
import { locks } from 'web-locks';
import { locksProvider } from '../../dist/index.js';

// web-locks expects an EventEmitter-like signal (`signal.on('abort', cb)`), not a native AbortSignal
function adaptSignal(signal) {
    return {
        on(_type, callback) {
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
    request(name, optionsOrCallback, callback) {
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
};
