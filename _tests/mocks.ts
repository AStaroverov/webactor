import { PING, PONG } from '../src/defs';
import { jest } from '@jest/globals';

const { MessageChannel } = require('worker_threads');

export class MessageChannelMock extends MessageChannel {
    addEventListener(...args: any[]) {
        return this.on(...args);
    }

    removeEventListener(...args: any[]) {
        return this.off(...args);
    }
}

export class WorkerMock {
    channel = new MessageChannel();

    constructor() {
        this.channel.port2.addListener('message', (event: MessageEvent) => {
            event.data === PING && this.channel.port2.postMessage({ data: PONG });
        });
    }

    terminate() {
        this.channel.port1.close();
        this.channel.port2.close();
    }

    start() {}

    postMessage = jest.fn((message: string | object, transferable?: Transferable[]) => {
        this.channel.port1.postMessage({ data: message }, transferable);
    });
    addEventListener = jest.fn((type: string, listener: (event: MessageEvent) => void) => {
        this.channel.port1.addListener(type, listener);
    });
    removeEventListener = jest.fn((type: string, listener: (event: MessageEvent) => void) => {
        this.channel.port1.removeListener(type, listener);
    });
}

export class SharedWorkerMock {
    port = new WorkerMock();
    terminate() {
        this.port.terminate();
    }
}

export class WorkerGlobalScopeMock {
    channel = new MessageChannel();
    dispatch = (data: string | object, ports?: MessagePort[]) => {
        this.channel.port1.postMessage(
            {
                data,
                ports,
            },
            ports,
        );
    };
    postMessage = jest.fn((message: string | object, transferable?: Transferable[]) => {});
    addEventListener = jest.fn((type: 'message', listener: Function) => {
        this.channel.port2.addListener(type, listener);
    });
    removeEventListener = jest.fn((type: 'message', listener: Function) => {
        this.channel.port2.removeListener(type, listener);
    });

    terminate() {
        this.channel.port1.close();
        this.channel.port2.close();
    }
}

// @ts-ignore
global.MessageChannel = MessageChannelMock;
// @ts-ignore
global.Worker = WorkerMock;
// @ts-ignore
global.SharedWorker = SharedWorkerMock;
