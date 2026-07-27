import type { DevtoolsNode } from 'webactor';
import type { Store } from '../store';

export type Edge = {
    source: string;
    target: string;
    crossThread: boolean;
    closed: boolean;
    collapsed: boolean;
};

/**
 * Builds the edges to draw. Connections between hidden nodes are collapsed into a single edge between
 * their visible neighbours: without that, hiding ports would delete the edges that ran through them and
 * the graph would look like a field of disconnected dots.
 */
export function buildEdges(store: Store, isVisible: (node: DevtoolsNode) => boolean): Edge[] {
    const edges: Edge[] = [];

    const visible = (id: string) => {
        const node = store.nodes.get(id);
        return node !== undefined && isVisible(node);
    };
    const threadOf = (id: string) => store.nodes.get(id)?.thread;

    const neighbours = new Map<string, Set<string>>();
    const connect = (from: string, to: string) => {
        const bucket = neighbours.get(from);
        if (bucket === undefined) neighbours.set(from, new Set([to]));
        else bucket.add(to);
    };

    for (const link of store.links.values()) {
        if (!store.nodes.has(link.source) || !store.nodes.has(link.target)) continue;
        if (visible(link.source) && visible(link.target)) {
            edges.push({
                source: link.source,
                target: link.target,
                crossThread: link.crossThread,
                closed: link.closedAt !== undefined,
                collapsed: false,
            });
            continue;
        }
        connect(link.source, link.target);
        connect(link.target, link.source);
    }

    const seen = new Set<string>();
    for (const start of neighbours.keys()) {
        if (visible(start) || seen.has(start)) continue;

        const hidden: string[] = [];
        const ends = new Set<string>();
        const queue = [start];
        seen.add(start);

        while (queue.length > 0) {
            const current = queue.pop()!;
            hidden.push(current);
            for (const next of neighbours.get(current) ?? []) {
                if (visible(next)) {
                    ends.add(next);
                } else if (!seen.has(next)) {
                    seen.add(next);
                    queue.push(next);
                }
            }
        }

        const anchorCandidates = [...ends];
        const spansThreads = new Set(hidden.map(threadOf)).size > 1;
        for (let i = 0; i < anchorCandidates.length; i++) {
            for (let j = i + 1; j < anchorCandidates.length; j++) {
                edges.push({
                    source: anchorCandidates[i],
                    target: anchorCandidates[j],
                    crossThread: spansThreads || threadOf(anchorCandidates[i]) !== threadOf(anchorCandidates[j]),
                    closed: false,
                    collapsed: true,
                });
            }
        }
    }

    return edges;
}
