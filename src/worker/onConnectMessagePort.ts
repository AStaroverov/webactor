import { isEnvelope } from '../envelope';
import { response } from '../request/response';
import { EventType, Transmitter } from '../types';
import { lock } from '../utils/lock';
import { threadId } from '../utils/thread';
import { on } from '../utils/transmitter';
import { THREAD_ID_REQUEST } from './defs';
import { isDedicatedWorkerScope, isMessagePortLike, isSharedWorkerScope } from './detect';

const dependencies = <const>{
    isDedicatedWorkerScope,
    isSharedWorkerScope,
};

export function onConnectMessagePort(
    onConnect: (port: MessagePort) => unknown,
    { isDedicatedWorkerScope, isSharedWorkerScope } = dependencies,
): VoidFunction {
    const context = globalThis as unknown;
    const unlockThreadIdPromise = lock(threadId)
    const responseWithThreadId = (port: MessagePort) => {
        return on(port, EventType.Message, (envelope) => {
            if (isEnvelope(envelope) && envelope.data === THREAD_ID_REQUEST) {
                unlockThreadIdPromise.then(() => response(port as Transmitter, envelope, { threadId }))
            }
        })
    };

    if (isDedicatedWorkerScope(context) || isMessagePortLike(context)) {
        const port = context as unknown as MessagePort;
        onConnect(port);
        return responseWithThreadId(port)
    }

    if (isSharedWorkerScope(context)) {
        const disposes: VoidFunction[] = [];
        const callback = (event: MessageEvent) => {
            const port = event.ports[0];
            port.start();
            onConnect(port);
            disposes.push(responseWithThreadId(port));
        };

        context.addEventListener('connect', callback);
        return () => {
            context.removeEventListener('connect', callback);
            disposes.forEach(fn => fn());
        };
    }

    throw new Error('Unsupported context');
}