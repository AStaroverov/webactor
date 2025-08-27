import '@apacheli/web-workers';
import { AbortController as AC, locks } from 'web-locks';
import { locksProvider } from '../../dist/index.js';

class AbortController extends AC {
    constructor() {
        super();
        // @ts-ignore
        Object.assign(this.signal, {
            addEventListener(...args) {
                // @ts-ignore
                return this.addListener(...args);
            },
            removeEventListener(...args) {
                // @ts-ignore
                return this.removeListener(...args);
            }
        })
    }
}

locksProvider.delegate = locks;
global.AbortController = AbortController;
