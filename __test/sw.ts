import { initSupervisor } from '../__src/serviceWorker/init';
import { setConsolePrefix } from './console';

setConsolePrefix('[SW]')

initSupervisor();

const id = Math.random().toString(36).substring(2, 15);
setInterval(() => {
    console.log('Service Worker is running', id);
}, 5000);
