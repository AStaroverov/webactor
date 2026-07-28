import { ValueOf } from './types';

export type Reason = ValueOf<typeof Reasons>;
export const Reasons = {
    Abort: 'Abort',
    Close: 'Close',
    Restart: 'Restart',
    LostConnection: 'Lost connection',
    Undeliverable: 'Undeliverable',
    Undeserializable: 'Undeserializable',
};
export const $Aborted = Symbol('Aborted');
