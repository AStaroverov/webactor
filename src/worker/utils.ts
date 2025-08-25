import { EventMessagePortLike, Message } from "../types";
import { isMessagePortLike } from "./detect";

export function getWorkerMessagePort(worker: unknown): EventMessagePortLike<Message> {
    if (isMessagePortLike(worker)) {
        return worker as EventMessagePortLike<Message>;
    }
    if (typeof worker === 'object' && worker !== null && 'port' in worker && isMessagePortLike(worker.port)) {
        return worker.port as EventMessagePortLike<Message>;
    }

    throw new Error('Invalid worker');
}
