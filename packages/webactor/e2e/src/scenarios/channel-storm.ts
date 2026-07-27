import type { AnyEnvelope, ChannelTransmitter } from 'webactor';
import { connectActors, createActor, openChannel, Reasons, supportChannel } from 'webactor';
import type { ScenarioResult } from '../harness';
import { round, Sampler, sleep, waitUntil } from '../harness';

export type ChannelStormConfig = {
    waves: number;
    channelsPerWave: number;
    messagesPerChannel: number;
    aborts: number;
};

export const channelStormDefaults: ChannelStormConfig = {
    waves: 5,
    channelsPerWave: 100,
    messagesPerChannel: 10,
    aborts: 200,
};

const OPEN_MARKER = 'open-load-channel';
const SLOW_MARKER = 'open-slow-channel';
const SLOW_SUPPORT_DELAY = 25;

async function countChannelLocks(): Promise<number> {
    const state = await navigator.locks.query();
    return (state.held ?? []).filter(
        (lock) => lock.name?.startsWith('openChannel') || lock.name?.startsWith('supportChannel'),
    ).length;
}

export async function runChannelStorm(overrides: Partial<ChannelStormConfig> = {}): Promise<ScenarioResult> {
    const { waves, channelsPerWave, messagesPerChannel, aborts } = { ...channelStormDefaults, ...overrides };
    const startedAt = performance.now();
    const errors: string[] = [];
    const openTiming = new Sampler();

    let supportsAttempted = 0;
    let supportsSettled = 0;
    let duplicateSupportsRejected = 0;
    let supportsLostBeforeHandshake = 0;
    // mid-flight aborts fire from the supporter, the moment the open request lands and
    // before it calls supportChannel — a timer here races the open latency on slow machines
    const midFlightControllers = new Map<string, AbortController>();
    const supporter = createActor('supporter', (context) => {
        const listener = (envelope: AnyEnvelope) => {
            const marker = typeof envelope.data === 'string' ? envelope.data : '';
            const slow = marker.startsWith(SLOW_MARKER);
            if (!slow && marker !== OPEN_MARKER) return;
            supportsAttempted += 1;
            const midFlight = midFlightControllers.get(marker);
            if (midFlight) queueMicrotask(() => midFlight.abort(new Error('storm abort')));
            const delay = slow ? sleep(SLOW_SUPPORT_DELAY) : Promise.resolve();
            delay
                .then(() => supportChannel(context, envelope))
                .then((channel) => {
                    channel.addEventListener('message', (reply: AnyEnvelope) => channel.postMessage(reply.data));
                })
                .catch((error) => {
                    const text = String(error);
                    if (text.includes('already supported')) {
                        duplicateSupportsRejected += 1;
                    } else if (text.includes(Reasons.LostConnection)) {
                        supportsLostBeforeHandshake += 1;
                    } else {
                        errors.push(`support: ${error}`);
                    }
                })
                .finally(() => {
                    supportsSettled += 1;
                });
        };
        context.addEventListener('message', listener);
        return () => context.removeEventListener('message', listener);
    });

    let open: (marker: string, signal?: AbortSignal) => Promise<ChannelTransmitter> = () =>
        Promise.reject(new Error('not launched'));
    const opener = createActor('opener', (context) => {
        open = (marker, signal) => openChannel(context, marker, { abortSignal: signal });
    });

    const disconnect = connectActors(opener, supporter);
    supporter.launch();
    opener.launch();

    let channelsOpened = 0;
    let echoesReceived = 0;

    for (let wave = 0; wave < waves; wave++) {
        const channels = await Promise.all(
            Array.from({ length: channelsPerWave }, async () => {
                const openStart = performance.now();
                const channel = await open(OPEN_MARKER);
                openTiming.add(performance.now() - openStart);
                return channel;
            }),
        );
        channelsOpened += channels.length;

        const expected = echoesReceived + channelsPerWave * messagesPerChannel;
        for (const channel of channels) {
            channel.addEventListener('message', () => {
                echoesReceived += 1;
            });
            for (let seq = 0; seq < messagesPerChannel; seq++) {
                channel.postMessage({ seq });
            }
        }
        await waitUntil(() => echoesReceived >= expected, {
            timeoutMs: 30_000,
            label: () => `wave ${wave}: got ${echoesReceived}/${expected} channel echoes`,
        });

        for (const channel of channels) channel.close();
    }

    let abortsRejected = 0;
    let abortsResolved = 0;
    const midFlightAborts = Math.floor(aborts / 2);
    const lateChannels: ChannelTransmitter[] = [];
    for (let i = 0; i < aborts; i++) {
        const controller = new AbortController();
        const midFlight = i < midFlightAborts;
        const marker = midFlight ? `${SLOW_MARKER}:${i}` : OPEN_MARKER;
        if (midFlight) midFlightControllers.set(marker, controller);
        open(marker, controller.signal)
            .then((channel) => {
                abortsResolved += 1;
                lateChannels.push(channel);
            })
            .catch(() => {
                abortsRejected += 1;
            });
        if (!midFlight) {
            if (i % 2 === 0) {
                controller.abort(new Error('storm abort'));
            } else {
                queueMicrotask(() => controller.abort(new Error('storm abort')));
            }
        }
    }
    try {
        await waitUntil(() => abortsRejected + abortsResolved >= aborts, {
            timeoutMs: 30_000,
            label: () => `abort storm: settled ${abortsRejected + abortsResolved}/${aborts}`,
        });
    } catch (error) {
        errors.push(String(error));
    }
    for (const channel of lateChannels) channel.close();

    try {
        await waitUntil(() => supportsSettled >= supportsAttempted, {
            timeoutMs: 15_000,
            label: () => `support side settled ${supportsSettled}/${supportsAttempted}`,
        });
    } catch (error) {
        errors.push(String(error));
    }

    disconnect();
    opener.close();
    supporter.close();

    let leakedChannelLocks = await countChannelLocks();
    const lockDeadline = performance.now() + 5_000;
    while (leakedChannelLocks > 0 && performance.now() < lockDeadline) {
        await sleep(50);
        leakedChannelLocks = await countChannelLocks();
    }
    if (leakedChannelLocks > 0) {
        errors.push(`${leakedChannelLocks} channel locks still held after cleanup`);
    }

    return {
        scenario: 'channel-storm',
        config: { waves, channelsPerWave, messagesPerChannel, aborts },
        durationMs: round(performance.now() - startedAt),
        counters: {
            channelsOpened,
            echoesExpected: waves * channelsPerWave * messagesPerChannel,
            echoesReceived,
            abortsRequested: aborts,
            abortsMidFlight: midFlightAborts,
            abortsRejected,
            abortsResolved,
            duplicateSupportsRejected,
            supportsLostBeforeHandshake,
            leakedChannelLocks,
        },
        timings: {
            channelOpen: openTiming.summary(),
        },
        errors,
    };
}
