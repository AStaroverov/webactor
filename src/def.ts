import { ValueOf } from "./types";

export const Reason = {
    Restart: 'Restart',
    LostWorker: new Error('Lost worker'),
    LostChannel: new Error('Lost channel'),
};

export type Reasons = ValueOf<typeof Reason>;