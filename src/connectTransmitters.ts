import { listen, post } from './dispatch';
import { AnyData, ErrorEventTypes, EventTypes, Transmitter } from './types';

export function connectTransmitters<T1 extends Transmitter, T2 extends Transmitter>(
    transmitter1: T1,
    transmitter2: T2,
): VoidFunction {
    const unsub1 = resubscribe(transmitter1, transmitter2);
    const unsub2 = resubscribe(transmitter2, transmitter1);

    return () => {
        unsub1();
        unsub2();
    };
}

function resubscribe(
    source: Transmitter,
    target: Transmitter,
) {
    const onError = (type: ErrorEventTypes, err: ErrorEvent | Error) => post(target, type, err);
    const onMessage = createReposter(source, target);
    return listen(source, onError, onMessage);
}

function createReposter(_source: Transmitter, target: Transmitter) {
    // const map = new WeakMap<MessagePortLike<AnyEnvelope>, Set<string>>();
    // const addMessageId = (port: MessagePortLike<AnyEnvelope>, id: string) => {
    //     if (!map.has(port)) {
    //         map.set(port, new Set());
    //     }
    //     map.get(port)!.add(id);
    // };
    // const hasMessageId = (port: MessagePortLike<AnyEnvelope>, id: string) => {
    //     return map.has(port) && map.get(port)!.has(id);
    // };

    return function repost(type: EventTypes, data: AnyData) {
        // const data = event.data;
        // const isResponse = data.channelId != null && hasMessageId(source, data.channelId);
        // const shouldCopy = target instanceof MessagePort && !isResponse;
        // const copy = shouldCopy
        //     ? new MessageEvent(event.type, {
        //         data: event.data,
        //         origin: event.origin,
        //         lastEventId: createEventId(),
        //     })
        //     : event;

        post(target, type, data);
        // event.data.channelId && addMessageId(target, event.data.channelId);
    };
}
