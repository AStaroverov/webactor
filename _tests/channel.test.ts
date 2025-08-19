import { describe, expect, it, jest } from '@jest/globals';
import './locks';

import { Mock } from 'jest-mock';
import { createMailbox } from '../examples/common/actors/createActor';
import type { Actor, AnyEnvelope, Envelope, OpenChanelContext, SupportChanelContext } from '../src';
import {
    connectActorToActor,
    createActorFactory,
    createEnvelope,
    openChannelFactory,
    supportChannelFactory,
} from '../src';

export const OPEN_TYPE = 'OPEN_TYPE' as const;
export type TOpenEnvelope = Envelope<typeof OPEN_TYPE, undefined>;
export const LEFT_TYPE = 'LEFT_TYPE' as const;
export type TLeftEnvelope = Envelope<typeof LEFT_TYPE, number>;
export const RIGHT_TYPE = 'CHANNEL_TYPE' as const;
export type TRightEnvelope = Envelope<typeof RIGHT_TYPE, number>;

describe(`Channel`, () => {
    const createActor = createActorFactory({ getMailbox: createMailbox });

    // TODO: use web worker
    it(`fast close`, (done) => {
        const ac1 = createActor<TLeftEnvelope, TOpenEnvelope | TLeftEnvelope>(`A1`, (context) => {
            const openChannel = openChannelFactory(context);
            return openChannel(createEnvelope(OPEN_TYPE, undefined), () => { });
        });

        const onCloseChannel = jest.fn();
        const onSupportChannel = jest.fn(() => onCloseChannel);
        const ac2 = createActor<TOpenEnvelope | TLeftEnvelope, TLeftEnvelope>(`A2`, (context) => {
            const supportChannel = supportChannelFactory(context);

            return context.addEventListener('message', (event) => {
                if (event.data.type === OPEN_TYPE) {
                    supportChannel(event.data, onSupportChannel);
                }
            });
        });

        connectActorToActor(ac1, ac2);

        ac2.launch();
        ac1.launch();
        ac1.destroy();

        setTimeout(() => {
            expect(onSupportChannel.mock.calls).toHaveLength(1);
            expect(onCloseChannel.mock.calls).toHaveLength(1);
            done();
        }, 1000);
    });

    it(`single one-way channel with sync close`, (done) => {
        const onChannelEnvelope1 = jest.fn(() => { });
        const onOpenChannel = jest.fn((channel: OpenChanelContext<TLeftEnvelope, TLeftEnvelope>) => {
            channel.addEventListener('message', onChannelEnvelope1);
        });
        const ac1 = createActor<TLeftEnvelope, TOpenEnvelope | TLeftEnvelope>(`A1`, (context) => {
            const openChannel = openChannelFactory(context);
            return openChannel(createEnvelope(OPEN_TYPE, undefined), onOpenChannel);
        });

        const onCloseChannel = jest.fn();
        const onSupportChannel = jest.fn((channel: SupportChanelContext<TOpenEnvelope, TRightEnvelope>) => {
            for (let i = 0; i < 4; i++) {
                channel.postMessage(createEnvelope(RIGHT_TYPE, i));
            }

            return () => {
                onCloseChannel();
            };
        });
        const ac2 = createActor<TOpenEnvelope | TLeftEnvelope, TLeftEnvelope>(`A2`, (context) => {
            const supportChannel = supportChannelFactory(context);

            return context.addEventListener('message', (event) => {
                if (event.data.type === OPEN_TYPE) {
                    const close = supportChannel(event.data, onSupportChannel);
                    close();
                }
            });
        });

        connectActorToActor(ac1, ac2);

        ac2.launch();
        ac1.launch();

        setTimeout(() => {
            expect(onOpenChannel.mock.calls).toHaveLength(1);
            expect(onSupportChannel.mock.calls).toHaveLength(1);
            expect(onChannelEnvelope1.mock.calls).toHaveLength(4);
            expect(onCloseChannel.mock.calls).toHaveLength(1);
            done();
        }, 100);
    });

    it(`single two-way channel`, (done) => {
        const onChannelEnvelope1 = jest.fn(() => { });
        const onOpenChannel = jest.fn((channel: OpenChanelContext<TLeftEnvelope, TLeftEnvelope>) => {
            channel.subscribe(onChannelEnvelope1);

            for (let i = 0; i < 3; i++) {
                channel.dispatch(createEnvelope(LEFT_TYPE, i));
            }
        });
        const ac1 = createActor<TLeftEnvelope, TOpenEnvelope | TLeftEnvelope>(`A1`, (context) => {
            const openChannel = openChannelFactory(context);
            return openChannel(createEnvelope(OPEN_TYPE, undefined), onOpenChannel);
        });

        const onCloseChannel = jest.fn();
        const onChannelEnvelope2 = jest.fn(() => { });
        const onSupportChannel = jest.fn((channel: SupportChanelContext<TOpenEnvelope, TRightEnvelope>) => {
            const unsub = channel.subscribe(onChannelEnvelope2);

            for (let i = 0; i < 4; i++) {
                channel.dispatch(createEnvelope(RIGHT_TYPE, i));
            }

            return () => {
                unsub();
                onCloseChannel();
            };
        });
        const ac2 = createActor<TOpenEnvelope | TLeftEnvelope, TLeftEnvelope>(`A2`, (context) => {
            const supportChannel = supportChannelFactory(context);
            const disposes: VoidFunction[] = [
                () => context.removeEventListener('message', callback)
            ];

            const callback = (event: MessageEvent<AnyEnvelope>) => {
                if (event.data.type === OPEN_TYPE) {
                    const close = supportChannel(event.data, onSupportChannel);
                    disposes.push(close);
                }
            }

            context.addEventListener('message', callback);

            return () => {
                for (const dispose of disposes) {
                    dispose();
                }
            };
        });

        connectActorToActor(ac1, ac2);

        ac2.launch();
        ac1.launch();

        setTimeout(() => {
            ac1.destroy();
            ac2.destroy();
            expect(onOpenChannel.mock.calls).toHaveLength(1);
            expect(onSupportChannel.mock.calls).toHaveLength(1);
            expect(onChannelEnvelope1.mock.calls).toHaveLength(4);
            expect(onChannelEnvelope2.mock.calls).toHaveLength(3);
            expect(onCloseChannel.mock.calls).toHaveLength(1);
            done();
        }, 100);
    });

    it(`single channel through few actors`, (done) => {
        const createActorWrapper = <T extends Actor>(createInternalActor: () => T) =>
            createActor<AnyEnvelope, AnyEnvelope>(`ActorWrapper`, (context) => {
                const actor = createInternalActor();
                const disconnect = connectActorToActor(context, actor);

                actor.launch();

                return () => {
                    disconnect();
                    actor.destroy();
                };
            });

        const onChannelEnvelope1 = jest.fn();
        const onChannelEnvelope2 = jest.fn();

        const onOpenChannel = jest.fn((channel: OpenChanelContext<TLeftEnvelope, TLeftEnvelope>) => {
            channel.subscribe(onChannelEnvelope1);

            setTimeout(() => {
                for (let i = 0; i < 3; i++) {
                    channel.dispatch(createEnvelope(LEFT_TYPE, i));
                }
            }, 1);
        });

        const onSupportChannel = jest.fn((channel: SupportChanelContext<TOpenEnvelope, TRightEnvelope>) => {
            channel.subscribe(onChannelEnvelope2);

            setTimeout(() => {
                for (let i = 0; i < 4; i++) {
                    channel.dispatch(createEnvelope(RIGHT_TYPE, i));
                }
            }, 2);
        });

        const createActorStart = () =>
            createActor<TLeftEnvelope, TOpenEnvelope | TLeftEnvelope>(`ActorStart`, (context) => {
                const openChannel = openChannelFactory(context);
                return openChannel(createEnvelope(OPEN_TYPE, undefined), onOpenChannel);
            });

        const createActorEnd = () =>
            createActor<TOpenEnvelope | TLeftEnvelope, TLeftEnvelope>(`ActorEnd`, (context) => {
                const supportChannel = supportChannelFactory(context);
                const callback = (event: MessageEvent<AnyEnvelope>) => {
                    if (event.data.type === OPEN_TYPE) {
                        supportChannel(event.data, onSupportChannel);
                    }
                };
                context.addEventListener('message', callback);
                return () => {
                    context.removeEventListener('message', callback);
                }
            });

        const start = createActorStart();
        const wrapper = createActorWrapper(() => createActorWrapper(() => createActorEnd()));

        connectActorToActor(start, wrapper);

        wrapper.launch();
        start.launch();

        expect(onOpenChannel.mock.calls).toHaveLength(1);
        expect(onSupportChannel.mock.calls).toHaveLength(1);

        setTimeout(() => {
            expect(onChannelEnvelope1.mock.calls).toHaveLength(4);
            expect(onChannelEnvelope2.mock.calls).toHaveLength(3);
            start.destroy();
            wrapper.destroy();
            done();
        }, 20);
    });

    it(`multiple channels`, (done) => {
        const onCloseChannels: Mock[] = [];
        const onChannelEnvelopesFromOpen: Mock[] = [];
        const onChannelEnvelopesFromSupport: Mock[] = [];

        const onOpenChannel = jest.fn((channel: OpenChanelContext<TLeftEnvelope, TLeftEnvelope>) => {
            const uniq = Math.random();
            const onChannelEnvelope = jest.fn();

            for (let i = 0; i < 3; i++) {
                channel.dispatch(createEnvelope(LEFT_TYPE, uniq));
            }

            channel.subscribe(onChannelEnvelope);
            onChannelEnvelopesFromOpen.push(onChannelEnvelope);
        });
        const ac1 = createActor<TLeftEnvelope, TOpenEnvelope | TLeftEnvelope>(`A1`, (context) => {
            const openChannel = openChannelFactory(context);
            return openChannel(createEnvelope(OPEN_TYPE, undefined), onOpenChannel);
        });

        const onSupportChannel = jest.fn((channel: SupportChanelContext<TOpenEnvelope, TRightEnvelope>) => {
            const uniq = Math.random();
            const onChannelEnvelope = jest.fn();
            const onCloseChannel = jest.fn(() => unsub());
            const unsub = channel.subscribe(onChannelEnvelope);

            for (let i = 0; i < 4; i++) {
                channel.dispatch(createEnvelope(RIGHT_TYPE, uniq));
            }

            onCloseChannels.push(onCloseChannel);
            onChannelEnvelopesFromSupport.push(onChannelEnvelope);

            return onCloseChannel;
        });
        const createOtherActor = () =>
            createActor<TOpenEnvelope | TLeftEnvelope, TLeftEnvelope>(`OTHER`, (context) => {
                const supportChannel = supportChannelFactory(context);
                const callback = (event: MessageEvent<AnyEnvelope>) => {
                    if (event.data.type === OPEN_TYPE) {
                        const close = supportChannel(event.data, onSupportChannel);
                        setTimeout(close, 10);
                    }
                };
                context.addEventListener('message', callback);
                return () => {
                    context.removeEventListener('message', callback);
                };
            });

        const ac2 = createOtherActor();
        const ac3 = createOtherActor();

        connectActorToActor(ac1, ac2);
        connectActorToActor(ac1, ac3);

        ac3.launch();
        ac2.launch();
        ac1.launch();

        expect(onOpenChannel.mock.calls).toHaveLength(2);
        expect(onSupportChannel.mock.calls).toHaveLength(2);

        setTimeout(() => {
            for (const onChannelEnvelope of onChannelEnvelopesFromOpen) {
                const calls = onChannelEnvelope.mock.calls as Array<[TLeftEnvelope]>;

                expect(calls).toHaveLength(4);

                for (let i = 1; i < calls.length; i++) {
                    expect(calls[i][0].payload).toEqual(calls[i - 1][0].payload);
                }
            }

            for (const onChannelEnvelope of onChannelEnvelopesFromSupport) {
                const calls = onChannelEnvelope.mock.calls as Array<[TLeftEnvelope]>;

                expect(calls).toHaveLength(3);

                for (let i = 1; i < calls.length; i++) {
                    expect(calls[i][0].payload).toEqual(calls[i - 1][0].payload);
                }
            }

            for (const onCloseChannel of onCloseChannels) {
                expect(onCloseChannel.mock.calls).toHaveLength(1);
            }

            done();
        }, 20);
    });
});
