import { isEnvelope } from '../envelope';
import { loggerProvider } from '../providers';
import { noop } from '../utils/common';
import { subscribeOnUnlock } from '../utils/Locks';
import { checkPortAsReadyOnMessage, setPortName } from '../utils/MessagePort';
import { threadId } from '../utils/thread';
import { CONNECT_THREAD_TYPE, DISCONNECT_THREAD_TYPE } from './defs';
import { isDedicatedWorkerScope, isSharedWorkerScope } from './detect';
import { ConnectEnvelope, DisconnectEnvelope } from './types';

const dependencies = <const>{
    isDedicatedWorkerScope,
    isSharedWorkerScope,
};

export function onConnectMessagePort(
    context: DedicatedWorkerGlobalScope | SharedWorkerGlobalScope,
    onConnect: (port: MessagePort) => void | Function,
    { isDedicatedWorkerScope, isSharedWorkerScope } = dependencies,
): Function {
    if (isDedicatedWorkerScope(context)) {
        const listener = createListener(context as unknown as MessagePort, onConnect);
        context.addEventListener('message', listener);
        return () => context.removeEventListener('message', listener);
    }

    if (isSharedWorkerScope(context)) {
        const callback = (event: MessageEvent) => {
            const port = event.ports[0];
            const listener = createListener(port, onConnect);
            port.start();
            port.addEventListener('message', listener);
        };

        context.addEventListener('connect', callback);
        return () => context.removeEventListener('connect', callback);
    }

    return noop;
}

function createListener(port: MessagePort, callback: (port: MessagePort) => void | Function) {
    const mapPortNameCount = new Map<string, number>();
    const mapPortNameToUnsubscribe = new Map<string, Function>();

    return function listener(event: MessageEvent) {
        checkPortAsReadyOnMessage(event);

        if (!isEnvelope(event.data)) return;

        if (event.data.type === CONNECT_THREAD_TYPE) {
            const envelope = event.data as ConnectEnvelope;
            const connectedThreadId = envelope.threadId;
            const connectedName = envelope.payload;

            mapPortNameCount.set(connectedName, (mapPortNameCount.get(connectedName) ?? 0) + 1);

            if (!mapPortNameToUnsubscribe.has(connectedName)) {
                setPortName(port, connectedName);

                const disposes: Array<Function> = [
                    () => {
                        mapPortNameCount.delete(connectedName);
                        mapPortNameToUnsubscribe.delete(connectedName);
                    },
                ];
                const disconnect = () => disposes.forEach((dispose) => dispose());
                const callbackDispose = callback(port);

                if (callbackDispose !== undefined) {
                    disposes.push(callbackDispose);
                }

                if (threadId !== connectedThreadId) {
                    disposes.push(
                        subscribeOnUnlock(connectedThreadId, () => {
                            loggerProvider.info(`Disconnect thread[${connectedThreadId}] by unlock`);
                            disconnect();
                        }),
                    );
                }

                mapPortNameToUnsubscribe.set(connectedName, disconnect);
            }
        }

        if (event.data.type === DISCONNECT_THREAD_TYPE) {
            const envelope = event.data as DisconnectEnvelope;
            const name = envelope.payload;
            const count = (mapPortNameCount.get(name) ?? 1) - 1;

            loggerProvider.info(`Disconnect thread[${envelope.threadId}] by message`);

            if (count > 0) {
                mapPortNameCount.set(name, count);
            } else {
                mapPortNameToUnsubscribe.get(name)?.();
            }
        }
    };
}
