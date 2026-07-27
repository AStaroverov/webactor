import type { DevtoolsChannelSides } from './types';

export type ChannelTag = {
    channelId: string;
    side: DevtoolsChannelSides;
    name: string | undefined;
    /** The end the application holds, as opposed to the port that carries the channel to its peer. */
    local: boolean;
};

/**
 * Which channel a transmitter belongs to. Tagged even while nothing is recording, for the same reason
 * kinds are: a channel can already be open by the time devtools is switched on, and without the tag its
 * traffic would be indistinguishable from any other hop between two ports.
 */
const tags = new WeakMap<object, ChannelTag>();

export function tagChannelEnds(ends: readonly object[], tag: ChannelTag): void {
    for (const end of ends) tags.set(end, tag);
}

export function channelTagOf(transmitter: object): ChannelTag | undefined {
    return tags.get(transmitter);
}
