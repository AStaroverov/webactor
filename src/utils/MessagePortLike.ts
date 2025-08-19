import { EventListenerLike, Message, MessagePortLike } from "../types";

export function getFilteredListeners<T extends Message>(port: MessagePortLike<T>, filter: (message: MessageEvent) => boolean): EventListenerLike<T> {
    const map = new WeakMap<Function, Function>();
    return {
        addEventListener: (type: 'message' | 'messageerror', listener: (event: MessageEvent) => void) => {
            const wrappedListener = (event: MessageEvent) => {
                if (filter(event.data)) {
                    listener(event);
                }
            };
            map.set(listener, wrappedListener);
            port.start?.();
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
