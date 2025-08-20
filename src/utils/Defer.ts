export class Defer<T> {
    promise: Promise<T>;
    resolve!: (v: T) => void;
    reject!: (err: Error) => void;

    constructor(signal?: AbortSignal) {
        this.promise = new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
        });
        signal?.addEventListener('abort', () => {
            this.reject(
                typeof signal.reason === 'string'
                    ? new Error(signal.reason)
                    : signal.reason instanceof Error
                        ? signal.reason
                        : new Error('Aborted')
            );
        }, { once: true });
    }
}
