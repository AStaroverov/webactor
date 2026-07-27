import type { DevtoolsMessage, DevtoolsNode } from 'webactor';
import type { Store } from '../store';
import type { GraphTheme } from '../theme';
import { Bodies, ThreadLayout } from './bodies';
import { Camera } from './camera';
import { buildEdges, type Edge } from './edges';
import { step } from './forces';
import { bindInteraction } from './interaction';
import { type Pulse, Pulses } from './pulses';
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
    private readonly pulses = new Pulses();

    private edges: Edge[] = [];
    private edgesDirty = true;
    private edgesVersion = -1;
    private alpha = 1;
    private lastFrame = 0;
    private hovered: string | undefined;

    /** Whether nodes light up on traffic at all. */
    flash = true;
    /** Fades everything the watch selection does not touch, so the family of envelopes stands out. */
    dimUnwatched = false;
    selected: string | undefined;
    filter: (node: DevtoolsNode) => boolean = () => true;
    /** Marks the envelopes a watch filter selected, so their endpoints stand out. */
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

    /**
     * Lights up the two ends of one hop. Hidden endpoints are skipped rather than mapped onto their
     * stand-in: the thread on the far side records its own arrival, so the chain still reads end to end.
     */
    pulse(message: DevtoolsMessage): void {
        if (!this.flash) return;
        const watched = this.highlight(message);

        if (this.isNodeVisible(message.source)) {
            this.pulses.hit(message.source, 'sent');
            if (watched) this.pulses.hit(message.source, 'watched');
        }

        if (message.target !== message.source && this.isNodeVisible(message.target)) {
            this.pulses.hit(message.target, message.delivered ? 'received' : 'dropped');
            if (watched) this.pulses.hit(message.target, 'watched');
        }
    }

    screenOf(id: string): { x: number; y: number } | undefined {
        const body = this.bodies.get(id);
        return body === undefined ? undefined : this.camera.toScreen(body.x, body.y);
    }

    debugEdges(): Edge[] {
        return this.edges;
    }

    debugPulses(): [string, Pulse][] {
        return this.pulses.entries();
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
            this.edges = buildEdges(this.store, this.filter);
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

        this.pulses.advance(delta);

        draw({
            context: this.context,
            camera: this.camera,
            theme: this.theme,
            bodies: this.bodies,
            edges: this.edges,
            pulses: this.pulses,
            nodeAt: (id) => this.nodeAt(id),
            isVisible: this.filter,
            radiusOf: (node) => this.radiusOf(node),
            selected: this.selected,
            hovered: this.hovered,
            dimUnwatched: this.dimUnwatched,
        });

        requestAnimationFrame(this.frame);
    };
}

export type { Edge } from './edges';
