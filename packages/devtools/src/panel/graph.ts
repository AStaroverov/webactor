import type { DevtoolsMessage, DevtoolsNode } from 'webactor';
import type { Store } from './store';

type Body = {
    id: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
    fixed: boolean;
};

type Particle = {
    from: string;
    to: string;
    progress: number;
    speed: number;
    color: string;
    dropped: boolean;
};

type Edge = {
    source: string;
    target: string;
    crossThread: boolean;
    closed: boolean;
    collapsed: boolean;
};

export type GraphTheme = {
    background: string;
    edge: string;
    edgeCross: string;
    label: string;
    labelMuted: string;
    selection: string;
    threadBand: string;
    threadLabel: string;
};

const KIND_COLORS: Record<string, string> = {
    actor: '#5aa9ff',
    retranslator: '#a78bfa',
    supervisor: '#f59e0b',
    'thread-port': '#34d399',
    port: '#64748b',
    unknown: '#94a3b8',
};

const TYPE_COLORS: Record<string, string> = {
    message: '#7dd3fc',
    close: '#fbbf24',
    error: '#f87171',
};

const REPULSION = 9000;
const REPULSION_RANGE = 220;
const SPRING = 0.012;
const SPRING_LENGTH = 120;
const DAMPING = 0.86;
const THREAD_PULL = 0.02;
const CENTER_PULL = 0.004;
const MAX_PARTICLES = 400;

export class GraphView {
    private readonly context: CanvasRenderingContext2D;
    private readonly bodies = new Map<string, Body>();
    private readonly particles: Particle[] = [];
    private readonly anchors = new Map<string, string>();
    private edges: Edge[] = [];
    private edgesDirty = true;
    private edgesVersion = -1;
    private threadOrder: string[] = [];

    private width = 0;
    private height = 0;
    private lastFrame = 0;
    private scale = 1;
    private offsetX = 0;
    private offsetY = 0;
    private alpha = 1;

    private hovered: string | undefined;
    private dragging: Body | undefined;
    private panning = false;
    private pointerX = 0;
    private pointerY = 0;

    animate = true;
    selected: string | undefined;
    filter: (node: DevtoolsNode) => boolean = () => true;
    onSelect: (id: string | undefined) => void = () => {};

    constructor(
        private readonly canvas: HTMLCanvasElement,
        private readonly store: Store,
        private theme: GraphTheme,
    ) {
        const context = canvas.getContext('2d');
        if (context === null) throw new Error('canvas 2d context is unavailable');
        this.context = context;

        this.bindEvents();
        this.resize();
        requestAnimationFrame(this.frame);
    }

    setTheme(theme: GraphTheme): void {
        this.theme = theme;
    }

    invalidate(): void {
        this.alpha = Math.max(this.alpha, 0.7);
        this.edgesDirty = true;
    }

    resize(): void {
        const ratio = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();
        this.width = rect.width;
        this.height = rect.height;
        this.canvas.width = Math.max(1, Math.round(rect.width * ratio));
        this.canvas.height = Math.max(1, Math.round(rect.height * ratio));
        this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    resetView(): void {
        this.scale = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        for (const body of this.bodies.values()) body.fixed = false;
        this.invalidate();
    }

    spawn(message: DevtoolsMessage): void {
        if (!this.animate) return;
        if (this.particles.length >= MAX_PARTICLES) return;

        const from = this.visibleEndpoint(message.source);
        const to = this.visibleEndpoint(message.target);
        if (from === undefined || to === undefined || from === to) return;
        if (!this.bodies.has(from) || !this.bodies.has(to)) return;

        this.particles.push({
            from,
            to,
            progress: 0,
            speed: 0.0018 + Math.random() * 0.0006,
            color: TYPE_COLORS[message.type] ?? TYPE_COLORS.message,
            dropped: !message.delivered,
        });
    }

    private bindEvents(): void {
        this.canvas.addEventListener(
            'wheel',
            (event) => {
                event.preventDefault();
                const factor = Math.exp(-event.deltaY * 0.0015);
                const next = Math.min(4, Math.max(0.15, this.scale * factor));
                const rect = this.canvas.getBoundingClientRect();
                const px = event.clientX - rect.left - this.width / 2;
                const py = event.clientY - rect.top - this.height / 2;
                const anchor = this.toWorld(event);
                this.offsetX = px - anchor.x * next;
                this.offsetY = py - anchor.y * next;
                this.scale = next;
            },
            { passive: false },
        );

        this.canvas.addEventListener('pointerdown', (event) => {
            this.canvas.setPointerCapture(event.pointerId);
            const point = this.toWorld(event);
            const body = this.hitTest(point.x, point.y);
            if (body !== undefined) {
                this.dragging = body;
                body.fixed = true;
                this.selected = body.id;
                this.onSelect(body.id);
            } else {
                this.panning = true;
                this.selected = undefined;
                this.onSelect(undefined);
            }
            this.pointerX = event.clientX;
            this.pointerY = event.clientY;
        });

        this.canvas.addEventListener('pointermove', (event) => {
            const point = this.toWorld(event);
            if (this.dragging !== undefined) {
                this.dragging.x = point.x;
                this.dragging.y = point.y;
                this.dragging.vx = 0;
                this.dragging.vy = 0;
                this.invalidate();
            } else if (this.panning) {
                this.offsetX += event.clientX - this.pointerX;
                this.offsetY += event.clientY - this.pointerY;
                this.pointerX = event.clientX;
                this.pointerY = event.clientY;
            } else {
                const body = this.hitTest(point.x, point.y);
                this.hovered = body?.id;
                this.canvas.style.cursor = body === undefined ? 'default' : 'pointer';
            }
        });

        const release = () => {
            this.dragging = undefined;
            this.panning = false;
        };
        this.canvas.addEventListener('pointerup', release);
        this.canvas.addEventListener('pointercancel', release);
        this.canvas.addEventListener('dblclick', () => this.resetView());
    }

    private toWorld(event: { clientX: number; clientY: number }): { x: number; y: number } {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: (event.clientX - rect.left - this.offsetX - this.width / 2) / this.scale,
            y: (event.clientY - rect.top - this.offsetY - this.height / 2) / this.scale,
        };
    }

    private visibleEndpoint(id: string): string | undefined {
        const node = this.store.nodes.get(id);
        if (node === undefined) return undefined;
        return this.filter(node) ? id : this.anchors.get(id);
    }

    private radius(node: DevtoolsNode): number {
        if (node.kind === 'port') return 5;
        if (node.kind === 'supervisor' || node.kind === 'thread-port') return 9;
        return 8;
    }

    private hitTest(x: number, y: number): Body | undefined {
        let found: Body | undefined;
        let best = Infinity;
        for (const body of this.bodies.values()) {
            const node = this.store.nodes.get(body.id);
            if (node === undefined || !this.filter(node)) continue;
            const distance = (body.x - x) ** 2 + (body.y - y) ** 2;
            const reach = (this.radius(node) + 8) ** 2;
            if (distance <= reach && distance < best) {
                best = distance;
                found = body;
            }
        }
        return found;
    }

    private threadX(thread: string): number {
        const index = this.threadOrder.indexOf(thread);
        const count = Math.max(1, this.threadOrder.length);
        const span = Math.max(this.width / this.scale, 480);
        return ((index < 0 ? 0 : index) + 0.5) * (span / count) - span / 2;
    }

    private rebuildEdges(): void {
        this.edgesDirty = false;
        this.edgesVersion = this.store.version;
        this.edges = [];
        this.anchors.clear();

        const visible = (id: string) => {
            const node = this.store.nodes.get(id);
            return node !== undefined && this.filter(node);
        };

        const neighbours = new Map<string, Set<string>>();
        const connect = (from: string, to: string) => {
            const bucket = neighbours.get(from);
            if (bucket === undefined) neighbours.set(from, new Set([to]));
            else bucket.add(to);
        };

        for (const link of this.store.links.values()) {
            if (!this.store.nodes.has(link.source) || !this.store.nodes.has(link.target)) continue;
            if (visible(link.source) && visible(link.target)) {
                this.edges.push({
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
        for (const id of neighbours.keys()) {
            if (visible(id) || seen.has(id)) continue;

            const hidden: string[] = [];
            const anchors = new Set<string>();
            const queue = [id];
            seen.add(id);

            while (queue.length > 0) {
                const current = queue.pop()!;
                hidden.push(current);
                for (const next of neighbours.get(current) ?? []) {
                    if (visible(next)) {
                        anchors.add(next);
                    } else if (!seen.has(next)) {
                        seen.add(next);
                        queue.push(next);
                    }
                }
            }

            const ends = [...anchors];
            for (const node of hidden) {
                const thread = this.store.nodes.get(node)?.thread;
                const sameThread = ends.find((end) => this.store.nodes.get(end)?.thread === thread);
                const anchor = sameThread ?? ends[0];
                if (anchor !== undefined) this.anchors.set(node, anchor);
            }

            const crossThread = new Set(hidden.map((node) => this.store.nodes.get(node)?.thread)).size > 1;
            for (let i = 0; i < ends.length; i++) {
                for (let j = i + 1; j < ends.length; j++) {
                    this.edges.push({
                        source: ends[i],
                        target: ends[j],
                        crossThread:
                            crossThread ||
                            this.store.nodes.get(ends[i])?.thread !== this.store.nodes.get(ends[j])?.thread,
                        closed: false,
                        collapsed: true,
                    });
                }
            }
        }
    }

    private syncBodies(): void {
        const threads = this.store.threads;
        if (threads.length !== this.threadOrder.length || threads.some((t, i) => t !== this.threadOrder[i])) {
            this.threadOrder = threads;
            this.invalidate();
        }

        for (const node of this.store.nodes.values()) {
            if (this.bodies.has(node.id)) continue;
            const anchor = this.threadX(node.thread);
            this.bodies.set(node.id, {
                id: node.id,
                x: anchor + (Math.random() - 0.5) * 160,
                y: (Math.random() - 0.5) * 320,
                vx: 0,
                vy: 0,
                fixed: false,
            });
            this.invalidate();
        }

        for (const id of this.bodies.keys()) {
            if (!this.store.nodes.has(id)) this.bodies.delete(id);
        }
    }

    private simulate(): void {
        if (this.alpha < 0.005) return;

        const cell = REPULSION_RANGE;
        const grid = new Map<string, Body[]>();
        const visible: Body[] = [];

        for (const body of this.bodies.values()) {
            const node = this.store.nodes.get(body.id);
            if (node === undefined || !this.filter(node)) continue;
            visible.push(body);
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
                    const bucket = grid.get(`${ix}:${iy}`);
                    if (bucket === undefined) continue;
                    for (const other of bucket) {
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
                        const force = (REPULSION / (distance * distance)) * this.alpha;
                        body.vx += (dx / distance) * force;
                        body.vy += (dy / distance) * force;
                    }
                }
            }
        }

        for (const edge of this.edges) {
            const source = this.bodies.get(edge.source);
            const target = this.bodies.get(edge.target);
            if (source === undefined || target === undefined) continue;
            const dx = target.x - source.x;
            const dy = target.y - source.y;
            const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));
            const desired = edge.crossThread ? SPRING_LENGTH * 2 : SPRING_LENGTH;
            const force = (distance - desired) * SPRING * this.alpha;
            const fx = (dx / distance) * force;
            const fy = (dy / distance) * force;
            source.vx += fx;
            source.vy += fy;
            target.vx -= fx;
            target.vy -= fy;
        }

        for (const body of visible) {
            const node = this.store.nodes.get(body.id)!;
            body.vx += (this.threadX(node.thread) - body.x) * THREAD_PULL * this.alpha;
            body.vy += -body.y * CENTER_PULL * this.alpha;

            if (body.fixed) {
                body.vx = 0;
                body.vy = 0;
                continue;
            }
            body.vx *= DAMPING;
            body.vy *= DAMPING;
            body.x += Math.max(-40, Math.min(40, body.vx));
            body.y += Math.max(-40, Math.min(40, body.vy));
        }

        this.alpha *= 0.985;
    }

    private drawThreadBands(): void {
        if (this.threadOrder.length <= 1) return;
        const context = this.context;
        context.save();
        context.font = '11px ui-monospace, monospace';
        for (const thread of this.threadOrder) {
            const x = this.threadX(thread);
            context.strokeStyle = this.theme.threadBand;
            context.setLineDash([2, 6]);
            context.beginPath();
            context.moveTo(x, -this.height / this.scale);
            context.lineTo(x, this.height / this.scale);
            context.stroke();
            context.setLineDash([]);
            context.fillStyle = this.theme.threadLabel;
            context.textAlign = 'center';
            context.fillText(thread, x, -this.height / (2 * this.scale) + 16);
        }
        context.restore();
    }

    private drawLinks(): void {
        const context = this.context;
        for (const edge of this.edges) {
            const source = this.bodies.get(edge.source);
            const target = this.bodies.get(edge.target);
            if (source === undefined || target === undefined) continue;

            const highlighted =
                this.selected !== undefined && (edge.source === this.selected || edge.target === this.selected);

            context.globalAlpha = edge.closed ? 0.25 : 1;
            context.strokeStyle = highlighted
                ? this.theme.selection
                : edge.crossThread
                  ? this.theme.edgeCross
                  : this.theme.edge;
            context.lineWidth = highlighted ? 1.8 : 1;
            context.setLineDash(edge.closed ? [2, 3] : edge.crossThread ? [5, 4] : []);
            context.beginPath();
            context.moveTo(source.x, source.y);
            context.lineTo(target.x, target.y);
            context.stroke();
            context.setLineDash([]);
            context.globalAlpha = 1;
        }
    }

    private drawParticles(delta: number): void {
        const context = this.context;
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const particle = this.particles[i];
            particle.progress += particle.speed * delta;
            if (particle.progress >= 1) {
                this.particles.splice(i, 1);
                continue;
            }
            const from = this.bodies.get(particle.from);
            const to = this.bodies.get(particle.to);
            if (from === undefined || to === undefined) {
                this.particles.splice(i, 1);
                continue;
            }
            const x = from.x + (to.x - from.x) * particle.progress;
            const y = from.y + (to.y - from.y) * particle.progress;
            const fade = Math.sin(particle.progress * Math.PI);

            context.globalAlpha = 0.25 + fade * 0.75;
            context.fillStyle = particle.dropped ? TYPE_COLORS.error : particle.color;
            context.beginPath();
            context.arc(x, y, particle.dropped ? 2.5 : 3.2, 0, Math.PI * 2);
            context.fill();
            context.globalAlpha = 1;
        }
    }

    private drawNodes(): void {
        const context = this.context;
        context.font = '11px ui-sans-serif, system-ui, sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';

        for (const body of this.bodies.values()) {
            const node = this.store.nodes.get(body.id);
            if (node === undefined || !this.filter(node)) continue;

            const radius = this.radius(node);
            const closed = node.state === 'closed';
            const color = KIND_COLORS[node.kind] ?? KIND_COLORS.unknown;

            context.globalAlpha = closed ? 0.35 : 1;

            if (body.id === this.selected || body.id === this.hovered) {
                context.beginPath();
                context.arc(body.x, body.y, radius + 5, 0, Math.PI * 2);
                context.strokeStyle = this.theme.selection;
                context.lineWidth = 1.5;
                context.stroke();
            }

            context.beginPath();
            context.arc(body.x, body.y, radius, 0, Math.PI * 2);
            context.fillStyle = color;
            context.fill();

            if (node.state === 'created') {
                context.strokeStyle = this.theme.background;
                context.lineWidth = 2;
                context.beginPath();
                context.arc(body.x, body.y, radius * 0.45, 0, Math.PI * 2);
                context.stroke();
            }

            if (node.restarts > 0) {
                context.fillStyle = TYPE_COLORS.error;
                context.beginPath();
                context.arc(body.x + radius, body.y - radius, 3.5, 0, Math.PI * 2);
                context.fill();
            }

            if (this.scale > 0.5 && node.kind !== 'port') {
                context.fillStyle = closed ? this.theme.labelMuted : this.theme.label;
                context.fillText(node.name, body.x, body.y + radius + 9);
            }

            context.globalAlpha = 1;
        }
    }

    private frame = (time: number): void => {
        const delta = Math.min(48, time - this.lastFrame || 16);
        this.lastFrame = time;

        this.syncBodies();
        if (this.edgesDirty || this.edgesVersion !== this.store.version) this.rebuildEdges();
        this.simulate();

        const context = this.context;
        context.save();
        context.fillStyle = this.theme.background;
        context.fillRect(0, 0, this.width, this.height);

        context.translate(this.offsetX + this.width / 2, this.offsetY + this.height / 2);
        context.scale(this.scale, this.scale);

        this.drawThreadBands();
        this.drawLinks();
        this.drawParticles(delta);
        this.drawNodes();

        context.restore();
        requestAnimationFrame(this.frame);
    };

    debugBodies(): { id: string; x: number; y: number }[] {
        return [...this.bodies.values()].map((body) => ({ id: body.id, x: body.x, y: body.y }));
    }

    debugEdges(): Edge[] {
        return this.edges;
    }

    screenOf(id: string): { x: number; y: number } | undefined {
        const body = this.bodies.get(id);
        if (body === undefined) return undefined;
        return {
            x: this.offsetX + this.width / 2 + body.x * this.scale,
            y: this.offsetY + this.height / 2 + body.y * this.scale,
        };
    }

    focus(id: string): void {
        const body = this.bodies.get(id);
        if (body === undefined) return;
        this.offsetX = -body.x * this.scale;
        this.offsetY = -body.y * this.scale;
    }
}
