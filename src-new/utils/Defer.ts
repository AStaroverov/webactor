export class Defer<T, E = Error> {
    state: 'pending' | 'resolved' | 'rejected' = 'pending';
    promise: Promise<T>;
    resolve!: (v: T) => void;
    reject!: (err: E) => void;

    constructor() {
        this.promise = new Promise((resolve, reject) => {
            this.resolve = (v: T) => {
                this.state = 'resolved';
                resolve(v);
            };
            this.reject = (err: E): void => {
                this.state = 'rejected';
                reject(err);
            };
        });
    }
}
