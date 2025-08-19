import { Actor, ActorContext, AnyEnvelope, Mailbox } from './types';

type ActorConstructor<T extends AnyEnvelope> = (
    context: ActorContext<T>,
) => unknown | Function;

export function createActorFactory<T extends AnyEnvelope>(props: { getMailbox: () => Mailbox<T> }) {
    return function createActor(
        name: string,
        constructor: ActorConstructor<T>,
    ): Actor<T> {
        const mailboxIn = props.getMailbox();
        const mailboxOut = props.getMailbox();

        // @ts-ignore
        if (mailboxIn === mailboxOut) {
            throw new Error('getMailbox should return different instances');
        }

        let dispose: unknown | Function;

        const launch = () => {
            dispose = constructor({
                name,
                postMessage: mailboxOut.postMessage.bind(mailboxOut),
                dispatchEvent: mailboxOut.dispatchEvent.bind(mailboxOut),
                addEventListener: mailboxIn.addEventListener.bind(mailboxIn),
                removeEventListener: mailboxIn.removeEventListener.bind(mailboxIn),
            });
            return actor;
        };

        const destroy = () => {
            mailboxIn.destroy?.();
            mailboxOut.destroy?.();
            typeof dispose === 'function' && dispose();
        };

        const actor = {
            name,
            launch,
            destroy,
            postMessage: mailboxIn.postMessage.bind(mailboxIn),
            dispatchEvent: mailboxIn.dispatchEvent.bind(mailboxIn),
            addEventListener: mailboxOut.addEventListener.bind(mailboxOut),
            removeEventListener: mailboxOut.removeEventListener.bind(mailboxOut),
        };

        return actor;
    };
}
