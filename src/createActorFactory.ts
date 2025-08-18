import { Actor, ActorContext, AnyEnvelope, Mailbox } from './types';

type ActorConstructor<In extends AnyEnvelope, Out extends AnyEnvelope> = (
    context: ActorContext<In, Out>,
) => unknown | Function;

export function createActorFactory(props: { getMailbox: <T extends AnyEnvelope>() => Mailbox<T> }) {
    return function createActor<In extends AnyEnvelope, Out extends AnyEnvelope>(
        name: string,
        constructor: ActorConstructor<In, Out>,
    ): Actor<In, Out> {
        const mailboxIn = props.getMailbox<In>();
        const mailboxOut = props.getMailbox<Out>();

        // @ts-ignore
        if (mailboxIn === mailboxOut) {
            throw new Error('getMailbox should return different instances');
        }

        let dispose: unknown | Function;

        const launch = () => {
            dispose = constructor({
                name,

                postMessage: mailboxOut.postMessage.bind(mailboxOut),
                addEventListener: mailboxIn.addEventListener.bind(mailboxIn) as ActorContext<In, Out>['addEventListener'],
                removeEventListener: mailboxIn.removeEventListener.bind(mailboxIn) as ActorContext<In, Out>['removeEventListener'],
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
            addEventListener: mailboxOut.addEventListener.bind(mailboxOut) as Actor<In, Out>['addEventListener'],
            removeEventListener: mailboxOut.removeEventListener.bind(mailboxOut) as Actor<In, Out>['removeEventListener'],
        };

        return actor;
    };
}
