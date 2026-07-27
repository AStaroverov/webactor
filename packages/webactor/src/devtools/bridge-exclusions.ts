const excluded = new WeakSet<object>();

export function excludeFromBridge(transmitter: object): void {
    excluded.add(transmitter);
}

export function isExcludedFromBridge(transmitter: object): boolean {
    return excluded.has(transmitter);
}
