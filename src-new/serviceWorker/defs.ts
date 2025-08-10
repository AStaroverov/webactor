import { Envelope } from '../types';

export type ClientId = string;

export const REG_TYPE = 'REG';
export type RegEnvelope = Envelope<typeof REG_TYPE, undefined, [MessagePort]>;
