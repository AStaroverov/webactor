import { Message, MessagePortLike } from "../types";

export function proxyMessagePortWithListenerFilter<T extends Message>(port: MessagePortLike<T>, filter: (message: MessageEvent) => boolean): MessagePortLike<T> {
    const map = new WeakMap<Function, Function>();
    return {
        ...port,
        addEventListener: (type: 'message' | 'messageerror', listener: (event: MessageEvent) => void) => {
            const wrappedListener = (event: MessageEvent) => {
                if (filter(event.data)) {
                    listener(event);
                }
            };
            map.set(listener, wrappedListener);
            // @ts-ignore
            port.addEventListener(type, wrappedListener);
        },
        removeEventListener: (type: 'message' | 'messageerror', listener: (event: MessageEvent) => void) => {
            const wrappedListener = map.get(listener);
            if (wrappedListener) {
                // @ts-ignore
                port.removeEventListener(type, wrappedListener);
                map.delete(listener);
            }
        }
    }
}
