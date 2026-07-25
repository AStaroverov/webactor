import type { DevtoolsNode } from 'webactor';
import { type GraphTheme, KIND_COLORS, TYPE_COLORS } from '../theme';
import type { Bodies } from './bodies';
import type { Camera } from './camera';
import type { Edge } from './edges';
import type { Particles } from './particles';

const LABEL_SCALE_THRESHOLD = 0.5;

export type SceneInput = {
    context: CanvasRenderingContext2D;
    camera: Camera;
    theme: GraphTheme;
    bodies: Bodies;
    edges: Edge[];
    particles: Particles;
    threads: string[];
    threadX: (thread: string) => number;
    nodeAt: (id: string) => DevtoolsNode | undefined;
    isVisible: (node: DevtoolsNode) => boolean;
    radiusOf: (node: DevtoolsNode) => number;
    selected: string | undefined;
    hovered: string | undefined;
};

function drawThreadBands(scene: SceneInput): void {
    const { context, camera, theme, threads, threadX } = scene;
    if (threads.length <= 1) return;

    context.save();
    context.font = '11px ui-monospace, monospace';
    context.textAlign = 'center';
    for (const thread of threads) {
        const x = threadX(thread);
        context.strokeStyle = theme.threadBand;
        context.setLineDash([2, 6]);
        context.beginPath();
        context.moveTo(x, -camera.height / camera.scale);
        context.lineTo(x, camera.height / camera.scale);
        context.stroke();
        context.setLineDash([]);
        context.fillStyle = theme.threadLabel;
        context.fillText(thread, x, -camera.height / (2 * camera.scale) + 16);
    }
    context.restore();
}

function drawEdges(scene: SceneInput): void {
    const { context, theme, bodies, edges, selected } = scene;

    for (const edge of edges) {
        const source = bodies.get(edge.source);
        const target = bodies.get(edge.target);
        if (source === undefined || target === undefined) continue;

        const highlighted = selected !== undefined && (edge.source === selected || edge.target === selected);

        context.globalAlpha = edge.closed ? 0.25 : 1;
        context.strokeStyle = highlighted ? theme.selection : edge.crossThread ? theme.edgeCross : theme.edge;
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

function drawParticles(scene: SceneInput): void {
    const { context, bodies, particles } = scene;

    for (const particle of particles.all) {
        const from = bodies.get(particle.from);
        const to = bodies.get(particle.to);
        if (from === undefined || to === undefined) continue;

        const x = from.x + (to.x - from.x) * particle.progress;
        const y = from.y + (to.y - from.y) * particle.progress;
        const fade = Math.sin(particle.progress * Math.PI);

        const radius = particle.highlighted ? 5 : particle.dropped ? 2.5 : 3.2;

        context.globalAlpha = 0.25 + fade * 0.75;
        context.fillStyle = particle.dropped ? TYPE_COLORS.error : particle.color;
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fill();

        if (particle.highlighted) {
            context.strokeStyle = scene.theme.label;
            context.lineWidth = 1.5;
            context.beginPath();
            context.arc(x, y, radius + 2.5, 0, Math.PI * 2);
            context.stroke();
        }

        context.globalAlpha = 1;
    }
}

function drawNodes(scene: SceneInput): void {
    const { context, camera, theme, bodies, nodeAt, isVisible, radiusOf, selected, hovered } = scene;

    context.font = '11px ui-sans-serif, system-ui, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';

    for (const body of bodies.values()) {
        const node = nodeAt(body.id);
        if (node === undefined || !isVisible(node)) continue;

        const radius = radiusOf(node);
        const closed = node.state === 'closed';

        context.globalAlpha = closed ? 0.35 : 1;

        if (body.id === selected || body.id === hovered) {
            context.beginPath();
            context.arc(body.x, body.y, radius + 5, 0, Math.PI * 2);
            context.strokeStyle = theme.selection;
            context.lineWidth = 1.5;
            context.stroke();
        }

        context.beginPath();
        context.arc(body.x, body.y, radius, 0, Math.PI * 2);
        context.fillStyle = KIND_COLORS[node.kind] ?? KIND_COLORS.unknown;
        context.fill();

        if (node.state === 'created') {
            context.strokeStyle = theme.background;
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

        if (camera.scale > LABEL_SCALE_THRESHOLD && node.kind !== 'port') {
            context.fillStyle = closed ? theme.labelMuted : theme.label;
            context.fillText(node.name, body.x, body.y + radius + 9);
        }

        context.globalAlpha = 1;
    }
}

export function draw(scene: SceneInput): void {
    const { context, camera, theme } = scene;

    context.save();
    context.fillStyle = theme.background;
    context.fillRect(0, 0, camera.width, camera.height);
    camera.apply(context);

    drawThreadBands(scene);
    drawEdges(scene);
    drawParticles(scene);
    drawNodes(scene);

    context.restore();
}
