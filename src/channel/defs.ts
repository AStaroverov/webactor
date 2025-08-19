
export type OpenChannelId = string;

export const HANDSHAKE = 'CHANNEL_HANDSHAKE' as const;


// export type HandshakeMessage = string
// export const createHandshakeMessage = () => `${HANDSHAKE_PREFIX}|${createShortRandomString()}`;
// export const isHandshakeMessage = (message: string): boolean => message.startsWith(HANDSHAKE_PREFIX);
// export const getHandshakeId = (message: string): string => {
//     const id = message.substring(HANDSHAKE_PREFIX.length + 1);
//     if (id == '') {
//         throw new Error('Invalid handshake message');
//     }
//     return id;
// };

// export const CHANNEL_READY_TYPE = '__CHANNEL_READY_TYPE__' as const;
// export const CHANNEL_CLOSE_TYPE = '__CHANNEL_CLOSE_TYPE__' as const;
