import type { ActorContext, AnyEnvelope, ChannelTransmitter } from 'webactor';
import { connectActorToWorker, createActor, openChannel } from 'webactor';
import type { ScenarioResult } from '../harness';
import { round, sleep } from '../harness';

export type CrossThreadChannelConfig = {
    messages: number;
    holdMs: number;
};

export const crossThreadChannelDefaults: CrossThreadChannelConfig = {
    messages: 1,
    holdMs: 1200,
};

export async function runCrossThreadChannel(
    overrides: Partial<CrossThreadChannelConfig> = {},
): Promise<ScenarioResult> {
    const { messages, holdMs } = { ...crossThreadChannelDefaults, ...overrides };
    const startedAt = performance.now();
    const errors: string[] = [];

    const worker = new Worker(new URL('../workers/channel-host.worker.ts', import.meta.url), {
        type: 'module',
        name: 'channel-host',
    });

    let open: (() => Promise<ChannelTransmitter>) | undefined;
    const client = createActor('channel-client', (context: ActorContext) => {
        open = () => openChannel(context, 'open-probe-channel');
    });

    const disconnect = connectActorToWorker(client, worker);
    client.launch();

    let received = 0;
    let channel: ChannelTransmitter | undefined;

    try {
        channel = await open!();
        channel.addEventListener('message', (_envelope: AnyEnvelope) => {
            received += 1;
        });
        for (let index = 0; index < messages; index++) channel.postMessage({ index });
    } catch (error) {
        errors.push(`open: ${error}`);
    }

    await sleep(holdMs);

    channel?.close();
    disconnect();
    client.close();
    worker.terminate();

    return {
        scenario: 'cross-thread-channel',
        config: { messages, holdMs },
        durationMs: round(performance.now() - startedAt),
        counters: {
            channelsOpened: channel === undefined ? 0 : 1,
            messagesSent: messages,
            repliesReceived: received,
        },
        timings: {},
        errors,
    };
}
