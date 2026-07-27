import type { Bodies, Body } from './bodies';
import type { Edge } from './edges';

const REPULSION = 9000;
const REPULSION_RANGE = 220;
const SPRING = 0.012;
const SPRING_LENGTH = 120;
const DAMPING = 0.86;
const THREAD_PULL = 0.02;
const CENTER_PULL = 0.004;
const MAX_STEP = 40;
const COOLING = 0.985;
const SETTLED = 0.005;

export type ForceInput = {
    bodies: Bodies;
    edges: Edge[];
    alpha: number;
    isVisible: (id: string) => boolean;
    anchorX: (id: string) => number;
};

function repel(visible: Body[], alpha: number): void {
    const cell = REPULSION_RANGE;
    const grid = new Map<string, Body[]>();

    for (const body of visible) {
        const key = `${Math.floor(body.x / cell)}:${Math.floor(body.y / cell)}`;
        const bucket = grid.get(key);
        if (bucket === undefined) grid.set(key, [body]);
        else bucket.push(body);
    }

    for (const body of visible) {
        const cx = Math.floor(body.x / cell);
        const cy = Math.floor(body.y / cell);
        for (let ix = cx - 1; ix <= cx + 1; ix++) {
            for (let iy = cy - 1; iy <= cy + 1; iy++) {
                for (const other of grid.get(`${ix}:${iy}`) ?? []) {
                    if (other === body) continue;
                    let dx = body.x - other.x;
                    let dy = body.y - other.y;
                    let distance = Math.sqrt(dx * dx + dy * dy);
                    if (distance === 0) {
                        dx = Math.random() - 0.5;
                        dy = Math.random() - 0.5;
                        distance = 0.01;
                    }
                    if (distance > REPULSION_RANGE) continue;
                    const force = (REPULSION / (distance * distance)) * alpha;
                    body.vx += (dx / distance) * force;
                    body.vy += (dy / distance) * force;
                }
            }
        }
    }
}

function pullTogether(bodies: Bodies, edges: Edge[], alpha: number): void {
    for (const edge of edges) {
        const source = bodies.get(edge.source);
        const target = bodies.get(edge.target);
        if (source === undefined || target === undefined) continue;

        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const desired = edge.crossThread ? SPRING_LENGTH * 2 : SPRING_LENGTH;
        const force = (distance - desired) * SPRING * alpha;
        const fx = (dx / distance) * force;
        const fy = (dy / distance) * force;

        source.vx += fx;
        source.vy += fy;
        target.vx -= fx;
        target.vy -= fy;
    }
}

function integrate(visible: Body[], alpha: number, anchorX: (id: string) => number): void {
    for (const body of visible) {
        body.vx += (anchorX(body.id) - body.x) * THREAD_PULL * alpha;
        body.vy += -body.y * CENTER_PULL * alpha;

        if (body.fixed) {
            body.vx = 0;
            body.vy = 0;
            continue;
        }

        body.vx *= DAMPING;
        body.vy *= DAMPING;
        body.x += Math.max(-MAX_STEP, Math.min(MAX_STEP, body.vx));
        body.y += Math.max(-MAX_STEP, Math.min(MAX_STEP, body.vy));
    }
}

/** Advances the layout one step and returns the cooled alpha; below SETTLED the layout is left alone. */
export function step({ bodies, edges, alpha, isVisible, anchorX }: ForceInput): number {
    if (alpha < SETTLED) return alpha;

    const visible: Body[] = [];
    for (const body of bodies.values()) {
        if (isVisible(body.id)) visible.push(body);
    }

    repel(visible, alpha);
    pullTogether(bodies, edges, alpha);
    integrate(visible, alpha, anchorX);

    return alpha * COOLING;
}
