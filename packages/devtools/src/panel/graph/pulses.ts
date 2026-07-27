const SPENT = 0.02;

export type PulseChannel = 'sent' | 'received' | 'dropped' | 'watched';

export type Pulse = Record<PulseChannel, number>;

const CHANNELS: PulseChannel[] = ['sent', 'received', 'dropped', 'watched'];

/** A watched node lingers far longer than a plain flash, so a whole route stays readable at a glance. */
const FADE_MS: Record<PulseChannel, number> = { sent: 450, received: 450, dropped: 450, watched: 3000 };

/**
 * Energy per node, set to full by a hop and faded out every frame. Traffic is orders of magnitude
 * faster than any animation, so nothing is drawn travelling anywhere: a node simply lights up in the
 * colour of what it just did, and stays lit while it keeps working.
 */
export class Pulses {
    private readonly nodes = new Map<string, Pulse>();

    at(id: string): Pulse | undefined {
        return this.nodes.get(id);
    }

    entries(): [string, Pulse][] {
        return [...this.nodes];
    }

    hit(id: string, channel: PulseChannel): void {
        let pulse = this.nodes.get(id);
        if (pulse === undefined) {
            pulse = { sent: 0, received: 0, dropped: 0, watched: 0 };
            this.nodes.set(id, pulse);
        }
        pulse[channel] = 1;
    }

    watches(id: string): boolean {
        return (this.nodes.get(id)?.watched ?? 0) > 0;
    }

    advance(delta: number): void {
        for (const [id, pulse] of this.nodes) {
            let lit = false;
            for (const channel of CHANNELS) {
                const next = pulse[channel] - delta / FADE_MS[channel];
                pulse[channel] = next > SPENT ? next : 0;
                if (pulse[channel] > 0) lit = true;
            }
            if (!lit) this.nodes.delete(id);
        }
    }

    clear(): void {
        this.nodes.clear();
    }
}
