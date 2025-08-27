import { AnyData, ValueOf } from "./types";

export type Reason = AnyData;
export const ReasonReacord = {
    Restart: 'Restart',
    LostWorker: new Error('Lost worker'),
    LostChannel: new Error('Lost channel'),
};

export type Reasons = ValueOf<typeof ReasonReacord>;