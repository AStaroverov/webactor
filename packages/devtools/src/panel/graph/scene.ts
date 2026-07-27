import type { DevtoolsNode } from 'webactor';
import { type GraphTheme, KIND_COLORS, PULSE_COLORS, TYPE_COLORS } from '../theme';
import type { Bodies } from './bodies';
import type { Camera } from './camera';
import type { Edge } from './edges';
import type { Pulse, Pulses } from './pulses';

const LABEL_SCALE_THRESHOLD = 0.5;
const HALO_ALPHA = 0.5;
const HALO_BANDS: { channel: 'dropped' | 'sent' | 'received'; gap: number }[] = [
    { channel: 'dropped', gap: 9 },
    { channel: 'sent', gap: 6 },
    { channel: 'received', gap: 3 },
];
const WATCH_GAP = 11;
const WATCH_WIDTH = 2.5;
const DIMMED = 0.16;

export type SceneInput = {
    context: CanvasRenderingContext2D;
    camera: Camera;
    theme: GraphTheme;
    bodies: Bodies;
    edges: Edge[];
    pulses: Pulses;
    nodeAt: (id: string) => DevtoolsNode | undefined;
    isVisible: (node: DevtoolsNode) => boolean;
    radiusOf: (node: DevtoolsNode) => number;
    selected: string | undefined;
    hovered: string | undefined;
    /** True while a watch selection is on: whatever it does not touch fades into the background. */
    dimUnwatched: boolean;
};

function drawEdges(scene: SceneInput): void {
    const { context, theme, bodies, edges, pulses, selected, dimUnwatched } = scene;

    for (const edge of edges) {
        const source = bodies.get(edge.source);
        const target = bodies.get(edge.target);
        if (source === undefined || target === undefined) continue;

        const highlighted = selected !== undefined && (edge.source === selected || edge.target === selected);
        const dimmed = dimUnwatched && !(pulses.watches(edge.source) && pulses.watches(edge.target));

        context.globalAlpha = (edge.closed ? 0.25 : 1) * (dimmed ? DIMMED : 1);
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

/** Bands widest first: the node fill lands on top, leaving one ring per channel that fired. */
function drawPulse(scene: SceneInput, x: number, y: number, radius: number, pulse: Pulse): void {
    const { context, theme } = scene;

    for (const band of HALO_BANDS) {
        const energy = pulse[band.channel];
        if (energy === 0) continue;
        context.globalAlpha = HALO_ALPHA * energy * energy;
        context.fillStyle = PULSE_COLORS[band.channel];
        context.beginPath();
        context.arc(x, y, radius + band.gap, 0, Math.PI * 2);
        context.fill();
    }

    if (pulse.watched > 0) {
        context.globalAlpha = 0.4 + 0.6 * pulse.watched;
        context.strokeStyle = theme.label;
        context.lineWidth = WATCH_WIDTH;
        context.beginPath();
        context.arc(x, y, radius + WATCH_GAP, 0, Math.PI * 2);
        context.stroke();
    }

    context.globalAlpha = 1;
}

function drawNodes(scene: SceneInput): void {
    const { context, camera, theme, bodies, pulses, nodeAt, isVisible, radiusOf, selected, hovered, dimUnwatched } =
        scene;

    context.font = '11px ui-sans-serif, system-ui, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';

    for (const body of bodies.values()) {
        const node = nodeAt(body.id);
        if (node === undefined || !isVisible(node)) continue;

        const radius = radiusOf(node);
        const closed = node.state === 'closed';

        const pulse = pulses.at(body.id);
        if (pulse !== undefined) drawPulse(scene, body.x, body.y, radius, pulse);

        const attention = body.id === selected || body.id === hovered;
        const dimmed = dimUnwatched && !attention && !pulses.watches(body.id);
        context.globalAlpha = (closed ? 0.35 : 1) * (dimmed ? DIMMED : 1);

        if (attention) {
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

    drawEdges(scene);
    drawNodes(scene);

    context.restore();
}
