import { createActor } from '../__src/createActor';
import { createEnvelope } from '../__src/envelope';
import { setConsolePrefix } from './console';
import { firstEnvelopeType } from './env';

setConsolePrefix('[Tab]')

const registerServiceWorker = async () => {
    if ('serviceWorker' in navigator) {
        await navigator.serviceWorker.getRegistrations().then((registrations) => {
            console.log('SWs ', registrations);
            return Promise.all(registrations.map((reg) => reg.unregister()));
        });

        try {
            const registration = await navigator.serviceWorker.register('./sw.ts', {
                type: 'module',
                scope: '/test-new/',
            });
            if (registration.installing) {
                console.log('Service worker installing');
            } else if (registration.waiting) {
                console.log('Service worker installed');
            } else if (registration.active) {
                console.log('Service worker active');
            }
        } catch (error) {
            console.error(`Registration failed with ${error}`);
        }
    }
};

registerServiceWorker();


const act1 = createActor('example1', (context) => {
    context.subscribe(firstEnvelopeType).subscribe((envelope) => {
        debugger
        console.log(`Received envelope of type ${envelope.type} with payload:`, envelope.payload);
    });
}).launch();

const act2 = createActor('example2', (context) => {
    setInterval(() => {
        context.dispatch(createEnvelope(firstEnvelopeType, { data: 'Hello from act2' })).subscribe();
    }, 1000);
}).launch();



