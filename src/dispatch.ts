import { isSystemEnvelope } from './isSystemEnvelope';
import { loggerProvider } from './providers';
import type { EnvelopeTarget, ExtractEnvelope } from './types';
import { AnyEnvelope } from './types';
import { onPortResolve } from './utils/MessagePort';
import { isPostMessageLike } from './worker/detect';

function createPortDispatch<T extends MessagePort>(port: T) {
    return function dispatchWithQueue(envelope: AnyEnvelope) {
        onPortResolve(port, (state) => {
            if (!state) return;
            try {
                port.postMessage(envelope, envelope.transferable as any);
            } catch (err) {
                loggerProvider.error(err);
            }
        });
    };
}

export function createDispatch<T extends EnvelopeTarget>(target: T) {
    if (target instanceof MessagePort) {
        return createPortDispatch(target);
    }

    if (isPostMessageLike(target)) {
        return target.postMessage.bind(target);
    }

    throw new Error('Invalid dispatch target');
}

export function createDeferredDispatch<T extends EnvelopeTarget>(target: T, promise: Promise<unknown>) {
    const dispatch = createDispatch(target);
    return function dispatchWithQueue(envelope: AnyEnvelope) {
        if (isSystemEnvelope(envelope)) {
            dispatch(envelope);
        } else {
            promise.then(() => dispatch(envelope)).catch(loggerProvider.error);
        }
    };
}

export function dispatch<T extends EnvelopeTarget, E extends ExtractEnvelope<T>>(target: T, envelope: E) {
    createDispatch(target)(envelope);
}
