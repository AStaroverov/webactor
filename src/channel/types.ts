import { EnvelopeTransmitter } from '../types';

/**
 * ChannelTransmitter представляет двунаправленный канал связи между двумя акторами.
 * Расширяет EnvelopeTransmitter методом close() для раннего закрытия канала.
 * 
 * Используется в Promise-based API каналов:
 * - openChannel(): Promise<ChannelTransmitter>
 * - supportChannel(): Promise<ChannelTransmitter>
 */
export type ChannelTransmitter = EnvelopeTransmitter & {
    close(): void;
};
