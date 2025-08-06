import { ValueOf } from '../types';
import { stringify } from './JSON';

export const ErrCode = {
    Unknown: 'Unknown',
    Timeout: 'Timeout',
    LockLost: 'LockLost',
} as const;

export class Err extends Error {
    static extractCode = (v: unknown) => {
        return v instanceof Err ? v.code : ErrCode.Unknown;
    };
    static throwing = (code: ValueOf<typeof ErrCode>, message: string) => {
        throw new Err(code, message);
    };

    code: ValueOf<typeof ErrCode>;

    constructor(code: ValueOf<typeof ErrCode>, message: string, options?: { cause: Error }) {
        super(message, options);
        this.code = code;
    }

    toError() {
        return new Error(this.toMessage(), { cause: this.cause });
    }

    toMessage() {
        return `[${this.code}] ${this.message}`;
    }
}

export function getErrorMessage(err: unknown): string {
    return err instanceof Err
        ? err.toMessage()
        : err instanceof Error
        ? err.message
        : stringify(err, 'Cannot stringify unknown Error');
}
