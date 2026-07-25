import { EnvelopeMessagePort } from '../types';

export type ChannelTransmitter = EnvelopeMessagePort & {
    close(): void;
};
