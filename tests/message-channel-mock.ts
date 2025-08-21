// Synchronous MessageChannel mock for testing
class MockMessagePort {
    private handlers = new Map<string, ((event: MessageEvent) => void)[]>();
    private otherPort: MockMessagePort | null = null;

    constructor() {
        this.start = this.start.bind(this);
        this.postMessage = this.postMessage.bind(this);
        this.addEventListener = this.addEventListener.bind(this);
        this.removeEventListener = this.removeEventListener.bind(this);
        this.close = this.close.bind(this);
    }

    setOtherPort(port: MockMessagePort) {
        this.otherPort = port;
    }

    start() {
        // No-op for sync mock
    }

    postMessage(data: any) {
        if (this.otherPort) {
            const event = new MessageEvent('message', { data });
            // Synchronous dispatch - this is the key difference!
            const handlers = this.otherPort.handlers.get('message') || [];
            handlers.forEach(handler => {
                try {
                    handler(event);
                } catch (error) {
                    console.error('Error in message handler:', error);
                }
            });
        }
    }

    addEventListener(type: string, handler: (event: MessageEvent) => void, options?: { once?: boolean }) {
        if (!this.handlers.has(type)) {
            this.handlers.set(type, []);
        }
        
        if (options?.once) {
            const onceHandler = (event: MessageEvent) => {
                handler(event);
                this.removeEventListener(type, onceHandler);
            };
            this.handlers.get(type)!.push(onceHandler);
        } else {
            this.handlers.get(type)!.push(handler);
        }
    }

    removeEventListener(type: string, handler: (event: MessageEvent) => void) {
        if (this.handlers.has(type)) {
            const handlers = this.handlers.get(type)!;
            const index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);
            }
        }
    }

    close() {
        this.handlers.clear();
        this.otherPort = null;
    }

    dispatchEvent(event: Event): boolean {
        const handlers = this.handlers.get(event.type) || [];
        handlers.forEach(handler => {
            try {
                handler(event as MessageEvent);
            } catch (error) {
                console.error('Error dispatching event:', error);
            }
        });
        return true;
    }
}

export class MockMessageChannel {
    port1: MockMessagePort;
    port2: MockMessagePort;

    constructor() {
        this.port1 = new MockMessagePort();
        this.port2 = new MockMessagePort();
        
        this.port1.setOtherPort(this.port2);
        this.port2.setOtherPort(this.port1);
    }
}

let originalMessageChannel: any;

export function setupMessageChannelMock() {
    // Store original and replace with sync mock
    originalMessageChannel = (global as any).MessageChannel;
    Object.defineProperty(global, 'MessageChannel', {
        value: MockMessageChannel,
        writable: true,
        configurable: true
    });
}

export function restoreMessageChannel() {
    // Restore original MessageChannel
    if (originalMessageChannel) {
        Object.defineProperty(global, 'MessageChannel', {
            value: originalMessageChannel,
            writable: true,
            configurable: true
        });
    } else {
        delete (global as any).MessageChannel;
    }
}