import { AnyEnvelope, createEnvelope, isEnvelope } from '../envelope';
import { intervalProvider } from '../providers';
import { Reasons } from '../reason';
import {
    EventType,
    Transmitter,
    type AnyData,
    type TransferableOptions
} from '../types';
import { createShortRandomString, reasonToError } from '../utils/common';
import { createRoute, Route } from '../utils/route';
import { on, post } from '../utils/transmitter';

export async function request(
    target: Transmitter,
    message: AnyData,
    options?: {
        retryDelay?: number;
        channelId?: Route;
        abortSignal?: AbortSignal;
        transferable?: TransferableOptions;
    }
): Promise<AnyEnvelope> {
    return new Promise((resolve, reject) => {
        if (options?.abortSignal?.aborted) {
            reject(reasonToError(options.abortSignal.reason, Reasons.Abort));
            return;
        }

        const onAbort = () => {
            reject(reasonToError(options?.abortSignal?.reason, Reasons.Abort));
            onFinally();
        };
        options?.abortSignal?.addEventListener('abort', onAbort);

        const chnanelId = options?.channelId ?? createShortRandomString()
        const envelope = isEnvelope(message) ? message : createEnvelope(
            EventType.Message,
            message,
            options?.transferable,
        );
        envelope.__checkpoints = createRoute(chnanelId);

        const retryIntervalId = intervalProvider.setInterval(
            () => post(target, envelope.type, envelope),
            options?.retryDelay ?? 500
        );
        const off = on(target, 'message', (envelope) => {
            if (!isEnvelope(envelope)) return;
            if (envelope.__route !== chnanelId) return;
            if (envelope.data instanceof Error) reject(envelope.data);
            else resolve(envelope);
            onFinally();
        });
        const onFinally = () => {
            options?.abortSignal?.removeEventListener('abort', onAbort);
            intervalProvider.clearInterval(retryIntervalId);
            off();
        }

        post(target, envelope.type, envelope);
    });
};
