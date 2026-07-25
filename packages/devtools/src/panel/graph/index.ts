import type { DevtoolsMessage, DevtoolsNode } from 'webactor';
import type { Store } from '../store';
import type { GraphTheme } from '../theme';
import { Bodies, ThreadLayout } from './bodies';
import { Camera } from './camera';
import { buildEdges, type Edge } from './edges';
import { step } from './forces';
import { bindInteraction } from './interaction';
import { Particles } from './particles';
import { draw } from './scene';

const RESTART_ALPHA = 0.7;
const PICK_SLACK = 8;
const MAX_FRAME_DELTA = 48;

const RADIUS: Record<string, number> = { port: 5, supervisor: 9, 'thread-port': 9 };
const DEFAULT_RADIUS = 8;

/**
 * Owns the canvas and drives one frame at a time: sync bodies, rebuild edges when the graph changed,
 * advance the layout, draw. Everything it delegates to lives in a sibling module.
 */
export class GraphView {
    private readonly context: CanvasRenderingContext2D;
    private readonly camera = new Camera();
    private readonly bodies = new Bodies();
    private readonly threads = new ThreadLayout();
    private readonly particles = new Particles();

    private edges: Edge[] = [];
    private anchors = new Map<string, string>();
    private edgesDirty = true;
    private edgesVersion = -1;
    private alpha = 1;
    private lastFrame = 0;
    private hovered: string | undefined;

    animate = true;
    selected: string | undefined;
    filter: (node: DevtoolsNode) => boolean = () => true;
    /** Marks the envelopes a watch filter selected, so they stand out while they travel. */
    highlight: (message: DevtoolsMessage) => boolean = () => false;
    onSelect: (id: string | undefined) => void = () => {};

    constructor(
        private readonly canvas: HTMLCanvasElement,
        private readonly store: Store,
        private theme: GraphTheme,
    ) {
        const context = canvas.getContext('2d');
        if (context === null) throw new Error('canvas 2d context is unavailable');
        this.context = context;

        bindInteraction(canvas, {
            camera: this.camera,
            pick: (x, y) => this.pick(x, y),
            onSelect: (id) => {
                this.selected = id;
                this.onSelect(id);
            },
            onHover: (id) => {
                this.hovered = id;
            },
            onChange: () => this.invalidate(),
            onResetView: () => this.resetView(),
        });

        this.resize();
        requestAnimationFrame(this.frame);
    }

    setTheme(theme: GraphTheme): void {
        this.theme = theme;
    }

    /** Wakes the layout up and forces the edge set to be rebuilt (filters changed, or the graph did). */
    invalidate(): void {
        this.alpha = Math.max(this.alpha, RESTART_ALPHA);
        this.edgesDirty = true;
    }

    resize(): void {
        const ratio = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();
        this.camera.setViewport(rect.width, rect.height);
        this.canvas.width = Math.max(1, Math.round(rect.width * ratio));
        this.canvas.height = Math.max(1, Math.round(rect.height * ratio));
        this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    resetView(): void {
        this.camera.reset();
        this.bodies.unpinAll();
        this.invalidate();
    }

    focus(id: string): void {
        const body = this.bodies.get(id);
        if (body !== undefined) this.camera.centerOn(body.x, body.y);
    }

    spawn(message: DevtoolsMessage): void {
        if (!this.animate) return;
        const from = this.visibleEndpoint(message.source);
        const to = this.visibleEndpoint(message.target);
        if (from === undefined || to === undefined || from === to) return;
        if (!this.bodies.has(from) || !this.bodies.has(to)) return;
        this.particles.spawn(message, from, to, this.highlight(message));
    }

    screenOf(id: string): { x: number; y: number } | undefined {
        const body = this.bodies.get(id);
        return body === undefined ? undefined : this.camera.toScreen(body.x, body.y);
    }

    debugEdges(): Edge[] {
        return this.edges;
    }

    private radiusOf(node: DevtoolsNode): number {
        return RADIUS[node.kind] ?? DEFAULT_RADIUS;
    }

    private nodeAt(id: string): DevtoolsNode | undefined {
        return this.store.nodes.get(id);
    }

    private isNodeVisible(id: string): boolean {
        const node = this.nodeAt(id);
        return node !== undefined && this.filter(node);
    }

    private visibleEndpoint(id: string): string | undefined {
        const node = this.nodeAt(id);
        if (node === undefined) return undefined;
        return this.filter(node) ? id : this.anchors.get(id);
    }

    private pick(x: number, y: number): ReturnType<Bodies['pick']> {
        return this.bodies.pick(
            x,
            y,
            (node) => this.radiusOf(node) + PICK_SLACK,
            (id) => (this.isNodeVisible(id) ? this.nodeAt(id) : undefined),
        );
    }

    private threadX(thread: string): number {
        return this.threads.xFor(thread, this.camera.width, this.camera.scale);
    }

    private frame = (time: number): void => {
        const delta = Math.min(MAX_FRAME_DELTA, time - this.lastFrame || 16);
        this.lastFrame = time;

        if (this.threads.sync(this.store.threads)) this.invalidate();
        if (this.bodies.sync(this.store, (thread) => this.threadX(thread))) this.invalidate();

        if (this.edgesDirty || this.edgesVersion !== this.store.version) {
            const built = buildEdges(this.store, this.filter);
            this.edges = built.edges;
            this.anchors = built.anchors;
            this.edgesDirty = false;
            this.edgesVersion = this.store.version;
        }

        this.alpha = step({
            bodies: this.bodies,
            edges: this.edges,
            alpha: this.alpha,
            isVisible: (id) => this.isNodeVisible(id),
            anchorX: (id) => this.threadX(this.nodeAt(id)?.thread ?? ''),
        });

        this.particles.advance(delta, (particle) => this.bodies.has(particle.from) && this.bodies.has(particle.to));

        draw({
            context: this.context,
            camera: this.camera,
            theme: this.theme,
            bodies: this.bodies,
            edges: this.edges,
            particles: this.particles,
            nodeAt: (id) => this.nodeAt(id),
            isVisible: this.filter,
            radiusOf: (node) => this.radiusOf(node),
            selected: this.selected,
            hovered: this.hovered,
        });

        requestAnimationFrame(this.frame);
    };
}

export type { Edge } from './edges';
