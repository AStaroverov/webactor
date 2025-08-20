// @ts-ignore
import { AbortController as AC, locks } from 'web-locks';
import { locksProvider } from '../src/providers';

class AbortController extends AC {
    constructor() {
        super();
        // @ts-ignore
        Object.assign(this.signal, {
            addEventListener(...args: any[]): void {
                // @ts-ignore
                return this.addListener(...args);
            },
            removeEventListener(...args: any[]): void {
                // @ts-ignore
                return this.removeListener(...args);
            }
        })
    }
}

locksProvider.delegate = locks;
global.AbortController = AbortController as typeof global.AbortController;
