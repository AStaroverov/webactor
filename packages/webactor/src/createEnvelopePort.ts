import { createEnvelopeEmitter } from './createEnvelopeEmitter';

export function createEnvelopeChannel() {
    const mailboxIn = createEnvelopeEmitter();
    const mailboxOut = createEnvelopeEmitter();
    const close = () => {
        mailboxIn.close?.();
        mailboxOut.close?.();
    };

    const port1 = {
        close,
        postMessage: mailboxOut.postMessage.bind(mailboxOut),
        addEventListener: mailboxIn.addEventListener.bind(mailboxIn),
        removeEventListener: mailboxIn.removeEventListener.bind(mailboxIn),
    };

    const port2 = {
        close,
        postMessage: mailboxIn.postMessage.bind(mailboxIn),
        addEventListener: mailboxOut.addEventListener.bind(mailboxOut),
        removeEventListener: mailboxOut.removeEventListener.bind(mailboxOut),
    };

    return { port1, port2 };
}
