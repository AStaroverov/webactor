import { connectActors } from './connectActors';
import { createRetranslator } from './createRetranslator';
import { Actor, Transmitter } from './types';
import { isDedicatedWorkerScope, isSharedWorkerScope } from './worker/detect';
import { useContextMessagePort } from './worker/useContextMessagePort';

export interface DenseNetwork {
    launch(): DenseNetwork;
    destroy(): void;
}

export function createDenseNetwork(...transmitters: Transmitter[]): DenseNetwork {
    if (transmitters.length === 0) {
        throw new Error('At least one transmitter is required to create dense network');
    }

    const hub = createRetranslator({
        name: 'dense-network-hub'
    });

    let launched = false;
    let destroyed = false;
    let disconnectFunctions: VoidFunction[] = [];

    const launch = () => {
        if (launched) {
            throw new Error('Dense network is already launched');
        }
        if (destroyed) {
            throw new Error('Dense network is already destroyed');
        }

        launched = true;

        disconnectFunctions = transmitters.map(transmitter =>
            connectActors(transmitter as Actor, hub)
        );
        // Connect the context message port if in a worker scope
        if (isDedicatedWorkerScope(globalThis) || isSharedWorkerScope(globalThis)) {
            disconnectFunctions.push(connectActors(useContextMessagePort(), hub));
        }

        hub.launch();
        transmitters.forEach(transmitter => {
            if ('launch' in transmitter && typeof transmitter.launch === 'function') {
                transmitter.launch();
            }
        });


        return network;
    };

    const destroy = () => {
        if (destroyed) {
            throw new Error('Dense network is already destroyed');
        }

        destroyed = true;

        disconnectFunctions.forEach(disconnect => {
            try {
                disconnect();
            } catch (error) {
                console.warn('Error disconnecting from dense network:', error);
            }
        });
        disconnectFunctions = [];

        hub.close();

        transmitters.forEach(transmitter => {
            try {
                if ('destroy' in transmitter && typeof transmitter.destroy === 'function') {
                    transmitter.destroy();
                } else if ('terminate' in transmitter && typeof transmitter.terminate === 'function') {
                    transmitter.terminate();
                } else if ('close' in transmitter && typeof transmitter.close === 'function') {
                    transmitter.close();
                }
            } catch (error) {
                console.warn('Error destroying transmitter in dense network:', error);
            }
        });
    };

    const network: DenseNetwork = {
        launch,
        destroy
    };

    return network;
}