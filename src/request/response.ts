import type { AnyEnvelope, PostMessageLike, SystemEnvelope } from '../types';
import { createRequestName } from './request';

function getResponseName(request: AnyEnvelope): string {
    return createRequestName(request.type).replace('Request', 'Response');
}

export function createResponseFactory<_T extends AnyEnvelope>(dispatch: PostMessageLike<_T>) {
    return function createResponse<T extends _T>(requester: AnyEnvelope) {
        const routePassed = getResponseName(requester);
        const routeAnnounced = requester.routePassed;

        function response(envelope: T | SystemEnvelope) {
            envelope.routePassed = routePassed;
            envelope.routeAnnounced = routeAnnounced;

            return dispatch(envelope as T);
        }

        response.responseName = routePassed;

        return response;
    };
}
