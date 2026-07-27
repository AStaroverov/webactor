import type { DevtoolsMessage, DevtoolsNode } from 'webactor';

export type ActorEntry = { node: DevtoolsNode; inScope: boolean; byPattern: boolean };

/**
 * Which actors are being debugged at all. A pattern keeps matching actors that appear later, which is
 * why it stays live instead of merely ticking boxes; picks add to it and exclusions carve out of it.
 */
export class ActorScope {
    private text = '';
    private pattern: RegExp | undefined;
    private readonly added = new Set<string>();
    private readonly excluded = new Set<string>();

    get empty(): boolean {
        return this.pattern === undefined && this.added.size === 0;
    }

    get valid(): boolean {
        return this.text === '' || this.pattern !== undefined;
    }

    /** A half-typed regex matches nothing useful, so it stays inactive until it compiles. */
    setPattern(text: string): void {
        this.text = text.trim();
        try {
            this.pattern = this.text === '' ? undefined : new RegExp(this.text, 'i');
        } catch {
            this.pattern = undefined;
        }
    }

    matchesPattern(name: string): boolean {
        return this.pattern?.test(name) === true;
    }

    holds(id: string, name: string): boolean {
        if (this.empty) return true;
        if (this.added.has(id)) return true;
        return this.matchesPattern(name) && !this.excluded.has(id);
    }

    /** An envelope stays visible when either end is in scope, so traffic across the border is not lost. */
    covers(message: DevtoolsMessage, nameOf: (id: string) => string): boolean {
        return this.holds(message.source, nameOf(message.source)) || this.holds(message.target, nameOf(message.target));
    }

    toggle(id: string, name: string): void {
        if (this.holds(id, name) && !this.empty) {
            this.added.delete(id);
            if (this.matchesPattern(name)) this.excluded.add(id);
            return;
        }
        this.excluded.delete(id);
        this.added.add(id);
    }

    clear(): void {
        this.added.clear();
        this.excluded.clear();
    }

    list(nodes: Iterable<DevtoolsNode>): ActorEntry[] {
        const scoped = !this.empty;
        const entries: ActorEntry[] = [];
        for (const node of nodes) {
            if (node.kind === 'port') continue;
            entries.push({
                node,
                inScope: scoped && this.holds(node.id, node.name),
                byPattern: this.matchesPattern(node.name),
            });
        }
        return entries.sort(
            (left, right) =>
                left.node.thread.localeCompare(right.node.thread) || left.node.name.localeCompare(right.node.name),
        );
    }
}
