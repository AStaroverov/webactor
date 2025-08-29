import { locksProvider } from '../providers';

export function lock(key: string): Promise<VoidFunction> {
    return new Promise<VoidFunction>((exResolve, exReject) => {
        locksProvider.request(key, () => {
            return new Promise((resolve) => {
                exResolve(resolve as VoidFunction);
            });
        }).catch(exReject);
    });
}

export function onUnlock(key: string, abortSignal?: AbortSignal): Promise<unknown> {
    return new Promise((resolve, reject) => {
        void locksProvider.request(key, { signal: abortSignal }, () => {
            resolve(undefined);
            return Promise.resolve();
        }).catch(reject);
    });
};
