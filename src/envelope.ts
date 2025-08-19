// import { AnyEnvelope, Envelope } from './types';
// import { createShortRandomString } from './utils/common';
// import { threadId } from './utils/thread';

// export function isEnvelope<T extends Envelope<any, any>>(some: any): some is T {
//     return typeof some === 'object' && typeof some.type === 'string';
// }

// export function createEnvelope<T extends string, P>(
//     type: T,
//     payload: P,
//     transferable?: undefined | Transferable[],
// ): Envelope<T, P> {
//     const id = createShortRandomString();
//     return {
//         type,
//         payload,
//         transferable,
//         threadId,
//         uniqueId: id,
//         // channelId: id,
//         routePassed: undefined,
//         routeAnnounced: undefined,
//     };
// }

// export function shallowCopyEnvelope<T extends AnyEnvelope>(envelope: T): T {
//     return Object.assign({}, envelope);
// }
