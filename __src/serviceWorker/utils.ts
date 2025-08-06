import { REG_TYPE, RegEnvelope } from './defs';
import { createEnvelope, isEnvelope } from '../envelope';

export function createRegEnvelope(): RegEnvelope {
    return createEnvelope(REG_TYPE, undefined);
}

export function isRegEnvelope(env: unknown): env is RegEnvelope {
    return isEnvelope(env) && env.type === 'REG';
}
