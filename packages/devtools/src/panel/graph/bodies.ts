import type { DevtoolsNode } from 'webactor';
import type { Store } from '../store';

export type Body = {
    id: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
    fixed: boolean;
};

const SPREAD_X = 160;
const SPREAD_Y = 320;
const MIN_SPAN = 480;

/** Places nodes in one vertical band per thread, so a page with three workers reads as four columns. */
export class ThreadLayout {
    private order: string[] = [];

    get threads(): string[] {
        return this.order;
    }

    sync(threads: string[]): boolean {
        const changed = threads.length !== this.order.length || threads.some((t, i) => t !== this.order[i]);
        if (changed) this.order = threads;
        return changed;
    }

    xFor(thread: string, viewportWidth: number, scale: number): number {
        const index = this.order.indexOf(thread);
        const count = Math.max(1, this.order.length);
        const span = Math.max(viewportWidth / scale, MIN_SPAN);
        return ((index < 0 ? 0 : index) + 0.5) * (span / count) - span / 2;
    }
}

export class Bodies {
    private readonly bodies = new Map<string, Body>();

    get(id: string): Body | undefined {
        return this.bodies.get(id);
    }

    has(id: string): boolean {
        return this.bodies.has(id);
    }

    values(): IterableIterator<Body> {
        return this.bodies.values();
    }

    unpinAll(): void {
        for (const body of this.bodies.values()) body.fixed = false;
    }

    /** Adds a body for every new node and drops bodies whose node is gone. Returns true when the set changed. */
    sync(store: Store, anchorFor: (thread: string) => number): boolean {
        let changed = false;

        for (const node of store.nodes.values()) {
            if (this.bodies.has(node.id)) continue;
            const anchor = anchorFor(node.thread);
            this.bodies.set(node.id, {
                id: node.id,
                x: anchor + (Math.random() - 0.5) * SPREAD_X,
                y: (Math.random() - 0.5) * SPREAD_Y,
                vx: 0,
                vy: 0,
                fixed: false,
            });
            changed = true;
        }

        for (const id of this.bodies.keys()) {
            if (!store.nodes.has(id)) {
                this.bodies.delete(id);
                changed = true;
            }
        }

        return changed;
    }

    pick(
        x: number,
        y: number,
        reachOf: (node: DevtoolsNode) => number,
        nodeAt: (id: string) => DevtoolsNode | undefined,
    ): Body | undefined {
        let found: Body | undefined;
        let best = Infinity;

        for (const body of this.bodies.values()) {
            const node = nodeAt(body.id);
            if (node === undefined) continue;
            const distance = (body.x - x) ** 2 + (body.y - y) ** 2;
            const reach = reachOf(node) ** 2;
            if (distance <= reach && distance < best) {
                best = distance;
                found = body;
            }
        }

        return found;
    }
}
