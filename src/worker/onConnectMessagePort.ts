import { noop } from '../utils/common';
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

    if (isDedicatedWorkerScope(context) || isMessagePortLike(context)) {
        const port = context as unknown as MessagePort;
        onConnect(port);
        return noop;
    }

    if (isSharedWorkerScope(context)) {
        const callback = (event: MessageEvent) => {
            const port = event.ports[0];
            port.start();
            onConnect(port);
        };

        context.addEventListener('connect', callback);
        return () => {
            context.removeEventListener('connect', callback);
        };
    }

    throw new Error('Unsupported context');
}