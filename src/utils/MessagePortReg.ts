import { createShortRandomString } from "./common";

export type MessagePortName = string;

const PREFIX = 'MessagePort';

export function createPortName(name: string = 'Unknown'): MessagePortName {
    return `${PREFIX}|${name}_${createShortRandomString()}` as MessagePortName;
}

export function isPortName(portName: string): boolean {
    return portName.startsWith(PREFIX);
}

const mapPortToName = new WeakMap<MessagePort, string>();

export function setPortName(port: MessagePort, name: string) {
    const currentName = mapPortToName.get(port);

    if (currentName === undefined) {
        mapPortToName.set(port, name);
    } else {
        throw new Error(`Port name already set to "${currentName}", can't set to "${name}"`);
    }
}

export function getPortName(port: MessagePort): string {
    if (!mapPortToName.has(port)) setPortName(port, createPortName());
    return mapPortToName.get(port)!;
}

// export function isPortReadyCheck(event: MessageEvent) {
//     return event.data === PING;
// }

// export function checkPortAsReady(port: MessagePort | DedicatedWorkerGlobalScope) {
//     port.postMessage(PONG);
// }

// export function checkPortAsReadyOnMessage(event: MessageEvent) {
//     if (isPortReadyCheck(event)) checkPortAsReady(event.target as MessagePort);
// }

// const mapPortToState = new WeakMap<MessagePort, boolean | Defer<boolean>>();

// export function closePort(port: MessagePort) {
//     const defer = mapPortToState.get(port);

//     if (defer instanceof Defer) {
//         defer.resolve(false);
//     }

//     mapPortToState.set(port, false);

//     port.postMessage(CLOSE);
//     port.close?.();
// }

// export function onPortResolve(port: MessagePort, onResolve: (state: boolean) => void): void {
//     if (!mapPortToState.has(port)) {
//         const defer = new Defer<boolean>();
//         const portListener = (event: MessageEvent) => {
//             if (event.data === PONG) defer.resolve(true);
//             if (event.data === CLOSE) defer.resolve(false);
//         };

//         port.start?.();
//         port.addEventListener('message', portListener);

//         queueMicrotask(() => port.postMessage(PING));
//         const intervalId = intervalProvider.setInterval(() => port.postMessage(PING), 25);

//         defer.promise
//             .then((state) => mapPortToState.set(port, state))
//             .finally(() => {
//                 intervalProvider.clearInterval(intervalId);
//                 port.removeEventListener('message', portListener);
//             });

//         mapPortToState.set(port, defer);
//     }

//     const state = mapPortToState.get(port)!;

//     if (state instanceof Defer) {
//         state.promise.then(onResolve);
//     } else {
//         onResolve(state);
//     }
// }

