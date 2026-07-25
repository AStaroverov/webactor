const MIN_SCALE = 0.15;
const MAX_SCALE = 4;

export type Point = { x: number; y: number };

/** Maps between client coordinates and world coordinates, with the origin at the canvas centre. */
export class Camera {
    scale = 1;
    offsetX = 0;
    offsetY = 0;
    width = 0;
    height = 0;

    setViewport(width: number, height: number): void {
        this.width = width;
        this.height = height;
    }

    reset(): void {
        this.scale = 1;
        this.offsetX = 0;
        this.offsetY = 0;
    }

    toWorld(offsetX: number, offsetY: number): Point {
        return {
            x: (offsetX - this.offsetX - this.width / 2) / this.scale,
            y: (offsetY - this.offsetY - this.height / 2) / this.scale,
        };
    }

    toScreen(x: number, y: number): Point {
        return {
            x: this.offsetX + this.width / 2 + x * this.scale,
            y: this.offsetY + this.height / 2 + y * this.scale,
        };
    }

    panBy(dx: number, dy: number): void {
        this.offsetX += dx;
        this.offsetY += dy;
    }

    zoomAt(offsetX: number, offsetY: number, factor: number): void {
        const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, this.scale * factor));
        const anchor = this.toWorld(offsetX, offsetY);
        this.offsetX = offsetX - this.width / 2 - anchor.x * next;
        this.offsetY = offsetY - this.height / 2 - anchor.y * next;
        this.scale = next;
    }

    centerOn(x: number, y: number): void {
        this.offsetX = -x * this.scale;
        this.offsetY = -y * this.scale;
    }

    apply(context: CanvasRenderingContext2D): void {
        context.translate(this.offsetX + this.width / 2, this.offsetY + this.height / 2);
        context.scale(this.scale, this.scale);
    }
}
