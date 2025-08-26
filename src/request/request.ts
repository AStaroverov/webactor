import { AnyEnvelope, createEnvelope, EnvelopeTransferable, isEnvelope } from '../envelope';
import { intervalProvider } from '../providers';
import {
    EventType,
    type AnyData,
    type EnvelopeMessagePort,
} from '../types';
import { createShortRandomString } from '../utils/common';
import { createRoute, Route } from '../utils/route';
import { listen, post } from '../utils/transmitter';
import { reasonToError } from '../worker/error';

export async function request(
    target: EnvelopeMessagePort,
    message: AnyData,
    options?: {
        retryDelay?: number;
        channelId?: Route;
        abortSignal?: AbortSignal;
        transferable?: EnvelopeTransferable;
    }
): Promise<AnyEnvelope> {
    return new Promise((resolve, reject) => {
        options?.abortSignal?.addEventListener('abort', () => {
            reject(reasonToError(options?.abortSignal?.reason, 'Request aborted'));
            onFinally();
        }, { once: true });

        const chnanelId = options?.channelId ?? createShortRandomString()
        const envelope = isEnvelope(message) ? message : createEnvelope(
            EventType.Message,
            message,
            options?.transferable,
        );
        envelope.__checkpoints =  createRoute(chnanelId);

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
            if (envelope.__route !== chnanelId) return;
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
