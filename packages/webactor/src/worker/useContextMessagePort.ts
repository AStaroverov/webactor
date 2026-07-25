import { connectTransmitters } from '../connectTransmitters';
import { createEnvelopeChannel } from '../createEnvelopePort';
import { devtools } from '../devtools/internal';
import { Transmitter } from '../types';
import { threadId } from '../utils/thread';
import { onConnectMessagePort } from './onConnectMessagePort';

export function useContextMessagePort() {
    const channel = createEnvelopeChannel();
    const disposes: VoidFunction[] = [];

    const stop = onConnectMessagePort(async (port) => {
        disposes.push(connectTransmitters(channel.port1, port as Transmitter));
    });
    disposes.push(stop);

    const contextPort = {
        ...channel.port2,
        name: threadId,
    };

    devtools.register(contextPort, channel.port1, 'thread-port', threadId);

    return contextPort;
}
