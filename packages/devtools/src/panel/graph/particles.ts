import type { DevtoolsMessage } from 'webactor';
import { TYPE_COLORS } from '../theme';

const MAX_PARTICLES = 400;
const BASE_SPEED = 0.0018;
const SPEED_JITTER = 0.0006;

export type Particle = {
    from: string;
    to: string;
    progress: number;
    speed: number;
    color: string;
    dropped: boolean;
    highlighted: boolean;
};

export class Particles {
    private items: Particle[] = [];

    get all(): readonly Particle[] {
        return this.items;
    }

    spawn(message: DevtoolsMessage, from: string, to: string, highlighted = false): void {
        if (this.items.length >= MAX_PARTICLES) return;
        this.items.push({
            from,
            to,
            progress: 0,
            speed: BASE_SPEED + Math.random() * SPEED_JITTER,
            color: TYPE_COLORS[message.type] ?? TYPE_COLORS.message,
            dropped: !message.delivered,
            highlighted,
        });
    }

    /** Advances every particle and drops the ones that finished or lost an endpoint. */
    advance(delta: number, hasEndpoints: (particle: Particle) => boolean): void {
        this.items = this.items.filter((particle) => {
            particle.progress += particle.speed * delta;
            return particle.progress < 1 && hasEndpoints(particle);
        });
    }

    clear(): void {
        this.items = [];
    }
}
