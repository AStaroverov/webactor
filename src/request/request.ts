import { listen, post } from '../dispatch';
import { AnyEnvelope, createEnvelope, isEnvelope } from '../envelope';
import { intervalProvider } from '../providers';
import {
    EventType,
    type AnyData,
    type EnvelopeMessagePort,
} from '../types';
import { createEventId } from '../utils/common';
import { reasonToError } from '../worker/error';

export async function request(
    target: EnvelopeMessagePort,
    message: AnyData,
    options?: {
        id?: string
        retryDelay?: number;
        abortSignal?: AbortSignal;
        transferable?: Transferable[];
    }
): Promise<AnyEnvelope> {
    return new Promise((resolve, reject) => {
        options?.abortSignal?.addEventListener('abort', () => {
            reject(reasonToError(options?.abortSignal?.reason, 'Request aborted'));
            onFinally();
        }, { once: true });

        const id = options?.id ?? createEventId();
        const envelope = isEnvelope(message) ? message : createEnvelope(EventType.Message, message, { id, channelId: id, transferable: options?.transferable });
        const retryIntervalId = intervalProvider.setInterval(
            () => post(target, envelope.type, envelope),
            options?.retryDelay ?? 500
        );
        const onError = (_type: string, error: Error | ErrorEvent) => {
            reject(error);
            onFinally();
        };
        const onResponse = (_type: string, envelope: AnyData) => {
            if (!isEnvelope(envelope)) throw new Error('Non-envelope message received');
            resolve(envelope);
            onFinally();
        };
        const unlisten = listen(target, onError, onResponse);
        const onFinally = () => {
            intervalProvider.clearInterval(retryIntervalId);
            unlisten();
        }

        post(target, envelope.type, envelope);
    });
};
