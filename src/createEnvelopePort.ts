import { createEnvelopeEmitter } from "./createEnvelopeEmitter";

export function createEnvelopeChannel() {
    const mailboxIn = createEnvelopeEmitter();
    const mailboxOut = createEnvelopeEmitter();
    const destroy = () => {
        mailboxIn.destroy?.();
        mailboxOut.destroy?.();
    }

    const port1 = {
        destroy,
        postMessage: mailboxOut.postMessage.bind(mailboxOut),
        addEventListener: mailboxIn.addEventListener.bind(mailboxIn),
        removeEventListener: mailboxIn.removeEventListener.bind(mailboxIn),
    }

    const port2 = {
        destroy,
        postMessage: mailboxIn.postMessage.bind(mailboxIn),
        addEventListener: mailboxOut.addEventListener.bind(mailboxOut),
        removeEventListener: mailboxOut.removeEventListener.bind(mailboxOut),
    }

    return { port1, port2 };
}