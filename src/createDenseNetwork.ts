import { connectTransmitters } from './connectTransmitters';
import { Actor, Transmitter } from './types';
import { connectWorkerToActor } from './worker';
import { isSharedWorker, isWorkerLike } from './worker/detect';

export interface DenseNetwork {
    launch(): void;
    close(): void;
}

export function createDenseNetwork(...transmitters: (Worker | SharedWorker | Transmitter)[]): DenseNetwork {
    if (transmitters.length === 0) {
        throw new Error('At least one transmitter is required to create dense network');
    }

    let closed = false;
    let launched = false;
    let disconnectFunctions: VoidFunction[] = [];

    const launch = () => {
        if (launched) return;
        launched = true;

        for (let i = 0; i < transmitters.length; i++) {
            const left = transmitters[i];
            for (let j = i + 1; j < transmitters.length; j++) {
                const right = transmitters[j];
                if (isWorkerLike(left) && !isWorkerLike(right)) {
                    disconnectFunctions.push(connectWorkerToActor(left, right as Actor));
                } else if (isWorkerLike(right) && !isWorkerLike(left)) {
                    disconnectFunctions.push(connectWorkerToActor(right, left as Actor));
                } else {
                    disconnectFunctions.push(connectTransmitters(left as Actor, right as Actor));
                }
            }
        }

        transmitters.forEach(transmitter => {
            if ('launch' in transmitter && typeof transmitter.launch === 'function') {
                transmitter.launch();
            }
        });

        return network;
    };

    const close = () => {
        if (closed) return;
        closed = true;

        disconnectFunctions.forEach(disconnect => {
            try {
                disconnect();
            } catch (error) {
                console.warn('Error disconnecting from dense network:', error);
            }
        });
        disconnectFunctions = [];

        transmitters.forEach(transmitter => {
            try {
                if ('close' in transmitter && typeof transmitter.close === 'function') {
                    transmitter.close();
                }
                if ('terminate' in transmitter && typeof transmitter.terminate === 'function') {
                    transmitter.terminate();
                }
                if (isSharedWorker(transmitter)) {
                    transmitter.port.close();
                }
            } catch (error) {
                console.warn('Error destroying transmitter in dense network:', error);
            }
        });
    };

    const network: DenseNetwork = {
        launch,
        close
    };

    return network;
}