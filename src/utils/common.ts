import { EnvelopeTransmitter } from '../types';
import { getPortName } from './MessagePort';

export const identity = <T = any>(v: T) => v;
export const noop = (): any => { };

export function createShortRandomString() {
    return Math.round(Math.random() * Date.now()).toString(32);
}

export function getTransmitterName<T extends EnvelopeTransmitter>(source: T) {
    if ('name' in source) return source.name;
    if (typeof source === 'object' && 'postMessage' in source) return getPortName(source);

    throw new Error('Can`t detect transmitter name');
}
