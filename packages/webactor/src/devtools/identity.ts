import type { Transmitter } from '../types';
import { getTransmitterName } from '../utils/transmitter';
import type { DevtoolsNodeKinds } from './types';

type Descriptor = {
    kind: DevtoolsNodeKinds;
    name: string | undefined;
    aliases: object[];
};

const identities = new WeakMap<object, string>();

// The descriptor holds its own keys in `aliases`. WeakMap entries are ephemerons,
// so that cycle still collects once the transmitters themselves are unreachable.
const descriptors = new WeakMap<object, Descriptor>();

export function describe(aliases: object[], kind: DevtoolsNodeKinds, name?: string): void {
    const descriptor: Descriptor = { kind, name, aliases };
    for (const alias of aliases) descriptors.set(alias, descriptor);
}

export function descriptorOf(transmitter: object): Descriptor | undefined {
    return descriptors.get(transmitter);
}

export function identify(transmitter: object): string {
    const known = identities.get(transmitter);
    if (known !== undefined) return known;

    const descriptor = descriptors.get(transmitter);
    const primary = descriptor?.aliases[0] ?? transmitter;
    const id = identities.get(primary) ?? getTransmitterName(primary as Transmitter);

    if (descriptor === undefined) identities.set(transmitter, id);
    else for (const alias of descriptor.aliases) identities.set(alias, id);

    return id;
}

export function displayName(id: string): string {
    const index = id.indexOf('<');
    return index === -1 ? id : id.slice(0, index);
}

export function inferKind(transmitter: object): DevtoolsNodeKinds {
    if (typeof MessagePort !== 'undefined' && transmitter instanceof MessagePort) return 'port';
    return 'unknown';
}
