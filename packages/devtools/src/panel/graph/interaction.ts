import type { Body } from './bodies';
import type { Camera } from './camera';

const ZOOM_SENSITIVITY = 0.0015;

export type InteractionHandlers = {
    camera: Camera;
    pick: (x: number, y: number) => Body | undefined;
    onSelect: (id: string | undefined) => void;
    onHover: (id: string | undefined) => void;
    onChange: VoidFunction;
    onResetView: VoidFunction;
};

export function bindInteraction(canvas: HTMLCanvasElement, handlers: InteractionHandlers): void {
    const { camera, pick, onSelect, onHover, onChange, onResetView } = handlers;

    let dragging: Body | undefined;
    let panning = false;
    let pointerX = 0;
    let pointerY = 0;

    const local = (event: PointerEvent | WheelEvent) => {
        const rect = canvas.getBoundingClientRect();
        return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };

    canvas.addEventListener(
        'wheel',
        (event) => {
            event.preventDefault();
            const point = local(event);
            camera.zoomAt(point.x, point.y, Math.exp(-event.deltaY * ZOOM_SENSITIVITY));
        },
        { passive: false },
    );

    canvas.addEventListener('pointerdown', (event) => {
        canvas.setPointerCapture(event.pointerId);
        const point = local(event);
        const world = camera.toWorld(point.x, point.y);
        const body = pick(world.x, world.y);

        if (body === undefined) {
            panning = true;
            onSelect(undefined);
        } else {
            dragging = body;
            body.fixed = true;
            onSelect(body.id);
        }

        pointerX = event.clientX;
        pointerY = event.clientY;
    });

    canvas.addEventListener('pointermove', (event) => {
        const point = local(event);
        const world = camera.toWorld(point.x, point.y);

        if (dragging !== undefined) {
            dragging.x = world.x;
            dragging.y = world.y;
            dragging.vx = 0;
            dragging.vy = 0;
            onChange();
            return;
        }

        if (panning) {
            camera.panBy(event.clientX - pointerX, event.clientY - pointerY);
            pointerX = event.clientX;
            pointerY = event.clientY;
            return;
        }

        const body = pick(world.x, world.y);
        onHover(body?.id);
        canvas.style.cursor = body === undefined ? 'default' : 'pointer';
    });

    const release = () => {
        dragging = undefined;
        panning = false;
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    canvas.addEventListener('dblclick', onResetView);
}
