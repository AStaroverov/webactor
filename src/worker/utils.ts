import { EventMessagePortLike, AnyData } from '../types';
import { isMessagePortLike } from './detect';

export function getWorkerMessagePort(worker: unknown): EventMessagePortLike<AnyData> {
    if (isMessagePortLike(worker)) {
        return worker as EventMessagePortLike<AnyData>;
    }
    if (typeof worker === 'object' && worker !== null && 'port' in worker && isMessagePortLike(worker.port)) {
        return worker.port as EventMessagePortLike<AnyData>;
    }

    throw new Error('Invalid worker');
}
