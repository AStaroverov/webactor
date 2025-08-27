import { connectTransmitters } from "../connectTransmitters";
import { createEnvelopeChannel } from "../createEnvelopePort";
import { Transmitter } from "../types";
import { lock } from "../utils/Locks";
import { threadId } from "../utils/thread";
import { getTransmitterName } from "../utils/transmitter";
import { onConnectMessagePort } from "./onConnectMessagePort";

export function useContextMessagePort() {
    const channel = createEnvelopeChannel();
    const disposes: VoidFunction[] = [];

    const stop = onConnectMessagePort(async (port) => {
        // race on dispatch
        await lock(getTransmitterName(port as Transmitter));
        const disconnect = connectTransmitters(channel.port1, port as Transmitter);
        disposes.push(disconnect);
    });
    disposes.push(stop);

    return {
        ...channel.port2,
        name: threadId,
    };
}