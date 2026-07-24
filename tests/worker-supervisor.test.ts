import { afterEach, describe, expect, it } from 'vitest';

import { Actor } from '../src/types';
import { applyWorkerSupervisor } from '../src/worker/applyWorkerSupervisor';

class FakeWorker {
    terminated = false;
    posted: any[] = [];
    private handlers = new Map<string, Set<(value: unknown) => void>>();

    postMessage = (message: any) => {
        this.posted.push(message);
    };

    addEventListener = (type: string, callback: (value: unknown) => void) => {
        if (!this.handlers.has(type)) this.handlers.set(type, new Set());
        this.handlers.get(type)!.add(callback);
    };

    removeEventListener = (type: string, callback: (value: unknown) => void) => {
        this.handlers.get(type)?.delete(callback);
    };

    terminate = () => {
        this.terminated = true;
    };

    emit(type: string, value: unknown) {
        this.handlers.get(type)?.forEach(callback => callback(value));
    }
}

describe('applyWorkerSupervisor (unit, fake worker)', () => {
    let supervisedActor: Actor | null = null;

    afterEach(async () => {
        supervisedActor?.close();
        supervisedActor = null;
        await new Promise(resolve => setTimeout(resolve, 20));
    });

    it('should terminate the current worker when supervisor is closed after a restart', async () => {
        const created: FakeWorker[] = [];
        const workerConstructor = () => {
            const worker = new FakeWorker();
            created.push(worker);
            return worker as unknown as Worker;
        };

        supervisedActor = applyWorkerSupervisor(workerConstructor, {
            shouldRetry: () => created.length < 2,
        });

        supervisedActor.launch();
        created[0].emit('error', new Error('worker crashed'));
        await new Promise(resolve => setTimeout(resolve, 20));

        expect(created).toHaveLength(2);
        expect(created[0].terminated).toBe(true);
        expect(created[1].terminated).toBe(false);

        supervisedActor.close();
        supervisedActor = null;

        expect(created[1].terminated).toBe(true);
    });

    it('should make at most one restart decision per worker instance', async () => {
        const created: FakeWorker[] = [];
        let retryCalls = 0;

        const workerConstructor = () => {
            const worker = new FakeWorker();
            created.push(worker);
            return worker as unknown as Worker;
        };

        supervisedActor = applyWorkerSupervisor(workerConstructor, {
            shouldRetry: () => {
                retryCalls++;
                return created.length < 2;
            },
        });

        supervisedActor.launch();
        created[0].emit('error', new Error('first'));
        created[0].emit('error', new Error('second'));
        await new Promise(resolve => setTimeout(resolve, 20));

        expect(retryCalls).toBe(1);
        expect(created).toHaveLength(2);
    });

    it('should not relaunch worker when supervisor is closed while shouldRetry is pending', async () => {
        const created: FakeWorker[] = [];
        let resolveRetry: (value: boolean) => void;
        const retryPromise = new Promise<boolean>(resolve => { resolveRetry = resolve; });

        const workerConstructor = () => {
            const worker = new FakeWorker();
            created.push(worker);
            return worker as unknown as Worker;
        };

        supervisedActor = applyWorkerSupervisor(workerConstructor, {
            shouldRetry: () => retryPromise,
        });

        supervisedActor.launch();
        created[0].emit('error', new Error('worker crashed'));
        await new Promise(resolve => setTimeout(resolve, 20));

        supervisedActor.close();
        supervisedActor = null;
        resolveRetry!(true);
        await new Promise(resolve => setTimeout(resolve, 20));

        expect(created).toHaveLength(1);
    });

    it('should treat a rejected shouldRetry as "do not restart"', async () => {
        const created: FakeWorker[] = [];

        const workerConstructor = () => {
            const worker = new FakeWorker();
            created.push(worker);
            return worker as unknown as Worker;
        };

        supervisedActor = applyWorkerSupervisor(workerConstructor, {
            shouldRetry: async () => {
                throw new Error('decision failed');
            },
        });

        supervisedActor.launch();
        created[0].emit('error', new Error('worker crashed'));
        await new Promise(resolve => setTimeout(resolve, 20));

        expect(created).toHaveLength(1);
        expect(created[0].terminated).toBe(true);
    });
});
