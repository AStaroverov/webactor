import type { Transmitter } from '../types';
import { getTransmitterName } from '../utils/transmitter';
import type { DevtoolsNodeKinds } from './types';

type Descriptor = {
    kind: DevtoolsNodeKinds;
    name: string | undefined;
    primary: object;
    alias: object | undefined;
};

const identities = new WeakMap<object, string>();

/**
 * Declared kinds, written whether or not anything is recording: a worker only ever activates after its
 * actors exist, so without this every actor behind a thread boundary would report as `unknown`. One
 * WeakMap write per transmitter is the whole cost of the recorder when it is switched off.
 */
const kinds = new WeakMap<object, DevtoolsNodeKinds>();

// A descriptor holds its own keys. WeakMap entries are ephemerons, so that cycle still collects
// once the transmitters themselves are unreachable.
const descriptors = new WeakMap<object, Descriptor>();

export function declareKind(transmitter: object, kind: DevtoolsNodeKinds): void {
    kinds.set(transmitter, kind);
}

export function describe(primary: object, alias: object | undefined, kind: DevtoolsNodeKinds, name?: string): void {
    const descriptor: Descriptor = { kind, name, primary, alias };
    descriptors.set(primary, descriptor);
    if (alias !== undefined) descriptors.set(alias, descriptor);
}

export function descriptorOf(transmitter: object): Descriptor | undefined {
    return descriptors.get(transmitter);
}

export function identify(transmitter: object): string {
    const known = identities.get(transmitter);
    if (known !== undefined) return known;

    const descriptor = descriptors.get(transmitter);
    const primary = descriptor?.primary ?? transmitter;
    const id = identities.get(primary) ?? getTransmitterName(primary as Transmitter);

    identities.set(primary, id);
    if (descriptor?.alias !== undefined) identities.set(descriptor.alias, id);

    return id;
}

export function displayName(id: string): string {
    const index = id.indexOf('<');
    return index === -1 ? id : id.slice(0, index);
}

export function inferKind(transmitter: object): DevtoolsNodeKinds {
    const declared = kinds.get(transmitter);
    if (declared !== undefined) return declared;
    if (typeof MessagePort !== 'undefined' && transmitter instanceof MessagePort) return 'port';
    return 'unknown';
}
