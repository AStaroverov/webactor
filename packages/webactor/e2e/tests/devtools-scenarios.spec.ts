import { expect, type Page, test } from '@playwright/test';
import type { DevtoolsEvent, DevtoolsLink, DevtoolsMessage, DevtoolsNode, DevtoolsSnapshot } from 'webactor';

declare global {
    interface Window {
        __devtoolsEvents: DevtoolsEvent[];
        __WEBACTOR_DEVTOOLS_HOOK__: { onEvents: (events: DevtoolsEvent[]) => void };
        __WEBACTOR_DEVTOOLS__: {
            snapshot: () => DevtoolsSnapshot;
            snapshotEvents: () => DevtoolsEvent[];
            flush: () => void;
            getOptions: () => { maxMessages: number };
        };
    }
}

type Capture = {
    events: DevtoolsEvent[];
    snapshot: DevtoolsSnapshot;
    nodes: DevtoolsNode[];
    links: DevtoolsLink[];
    messages: DevtoolsMessage[];
    maxMessages: number;
};

const RECORDER_NODE_CAP = 4000;

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
        const events: DevtoolsEvent[] = [];
        window.__devtoolsEvents = events;
        window.__WEBACTOR_DEVTOOLS_HOOK__ = {
            onEvents(batch) {
                events.push(...batch);
            },
        };
    });
    page.on('pageerror', (error) => {
        if (!String(error).includes('intentional crash')) throw error;
    });
    await page.goto('/');
    await page.waitForFunction(() => Boolean(window.__loadTest));
});

async function capture(page: Page, name: string, overrides: Record<string, number>): Promise<Capture> {
    await page.evaluate(
        ([scenario, config]) => window.__loadTest.run(scenario as string, config as Record<string, number>),
        [name, overrides] as const,
    );

    await page.waitForTimeout(150);

    const raw = await page.evaluate(() => {
        window.__WEBACTOR_DEVTOOLS__.flush();
        return {
            events: window.__devtoolsEvents,
            snapshot: window.__WEBACTOR_DEVTOOLS__.snapshot(),
            maxMessages: window.__WEBACTOR_DEVTOOLS__.getOptions().maxMessages,
        };
    });

    const nodes: DevtoolsNode[] = [];
    const links: DevtoolsLink[] = [];
    const messages: DevtoolsMessage[] = [];
    for (const event of raw.events) {
        if (event.type === 'node') nodes.push(event.node);
        if (event.type === 'link') links.push(event.link);
        if (event.type === 'message') messages.push(event.message);
    }

    return { ...raw, nodes, links, messages };
}

function assertInvariants(capture: Capture, label: string): void {
    const announced = new Set(capture.nodes.map((node) => node.id));
    const announcedLinks = new Set(capture.links.map((link) => link.id));

    for (const node of capture.nodes) {
        expect(node.name, `${label}: node without a name (${node.id})`).not.toBe('');
        expect(node.thread, `${label}: node without a thread (${node.id})`).not.toBe('');
        expect(
            node.id.includes(node.thread) || node.kind === 'port',
            `${label}: ${node.id} claims ${node.thread}`,
        ).toBe(true);
    }

    for (const link of capture.links) {
        expect(announced.has(link.source), `${label}: link from unannounced node ${link.source}`).toBe(true);
        expect(announced.has(link.target), `${label}: link to unannounced node ${link.target}`).toBe(true);
        expect(link.source, `${label}: self link on ${link.source}`).not.toBe(link.target);
    }

    for (const message of capture.messages) {
        expect(announced.has(message.source), `${label}: message from unannounced node ${message.source}`).toBe(true);
        expect(announced.has(message.target), `${label}: message to unannounced node ${message.target}`).toBe(true);
        expect(
            announcedLinks.has(`${message.source}|${message.target}`) ||
                announcedLinks.has(`${message.target}|${message.source}`),
            `${label}: message ${message.source} -> ${message.target} has no link`,
        ).toBe(true);
    }

    for (const event of capture.events) {
        if (event.type === 'node-closed') {
            expect(announced.has(event.id), `${label}: closed an unannounced node ${event.id}`).toBe(true);
        }
        if (event.type === 'link-closed') {
            expect(announcedLinks.has(event.id), `${label}: closed an unannounced link ${event.id}`).toBe(true);
        }
        if (event.type === 'restart') {
            expect(announced.has(event.id), `${label}: restart on an unannounced node ${event.id}`).toBe(true);
        }
    }

    const sequences = new Map<string, number>();
    for (const message of capture.messages) {
        const [thread, counter] = [
            message.seq.slice(0, message.seq.lastIndexOf(':')),
            Number(message.seq.split(':').at(-1)),
        ];
        const previous = sequences.get(thread);
        if (previous !== undefined) {
            expect(counter, `${label}: seq went backwards on ${thread}`).toBeGreaterThan(previous);
        }
        sequences.set(thread, counter);
    }

    expect(capture.snapshot.messages.length, `${label}: message ring buffer overflowed`).toBeLessThanOrEqual(
        Math.ceil(capture.maxMessages * 1.25),
    );
    expect(capture.snapshot.nodes.length, `${label}: node map exceeded its cap`).toBeLessThanOrEqual(RECORDER_NODE_CAP);

    for (const link of capture.snapshot.links) {
        const source = capture.snapshot.nodes.find((node) => node.id === link.source);
        const target = capture.snapshot.nodes.find((node) => node.id === link.target);
        expect(source, `${label}: snapshot link references a missing node ${link.source}`).toBeDefined();
        expect(target, `${label}: snapshot link references a missing node ${link.target}`).toBeDefined();
    }
}

const workerThreads = (capture: Capture) =>
    new Set(capture.nodes.filter((node) => node.thread.includes('Worker')).map((node) => node.thread));

test('actor-lifecycle: every actor is announced and closed', async ({ page }) => {
    const result = await capture(page, 'actor-lifecycle', { waves: 2, actorsPerWave: 20, messagesPerPair: 5 });
    assertInvariants(result, 'actor-lifecycle');

    const actors = result.nodes.filter((node) => node.kind === 'actor');
    expect(actors.length).toBeGreaterThanOrEqual(40);

    const closed = new Set(result.events.filter((event) => event.type === 'node-closed').map((event) => event.id));
    const actorIds = new Set(actors.map((node) => node.id));
    expect([...actorIds].filter((id) => !closed.has(id))).toHaveLength(0);

    const links = result.events.filter((event) => event.type === 'link').length;
    const unlinks = result.events.filter((event) => event.type === 'link-closed').length;
    expect(unlinks).toBe(links);
});

test('channel-thrashing: connect/disconnect churn is balanced', async ({ page }) => {
    const result = await capture(page, 'channel-thrashing', {
        actors: 40,
        rounds: 3,
        createPerRound: 10,
        destroyPerRound: 8,
        seed: 7,
    });
    assertInvariants(result, 'channel-thrashing');

    const links = result.events.filter((event) => event.type === 'link').length;
    const unlinks = result.events.filter((event) => event.type === 'link-closed').length;
    expect(links).toBeGreaterThan(20);
    expect(unlinks).toBeGreaterThan(0);
    expect(unlinks).toBeLessThanOrEqual(links);
});

test('message-flooding: heavy in-page traffic keeps the ring buffer bounded', async ({ page }) => {
    const result = await capture(page, 'message-flooding', {
        producers: 4,
        consumers: 4,
        bursts: 2,
        messagesPerBurst: 50,
    });
    assertInvariants(result, 'message-flooding');

    expect(result.messages.length).toBeGreaterThan(1000);
    expect(result.messages.every((message) => message.delivered)).toBe(true);
    expect(result.messages.every((message) => message.type === 'message' || message.type === 'close')).toBe(true);
});

test('port-flooding: real MessageChannels appear as port nodes', async ({ page }) => {
    const result = await capture(page, 'port-flooding', {
        producers: 3,
        consumers: 3,
        bursts: 2,
        messagesPerBurst: 25,
    });
    assertInvariants(result, 'port-flooding');

    expect(result.nodes.some((node) => node.kind === 'port')).toBe(true);
    expect(result.messages.length).toBeGreaterThan(100);
});

test('worker-flooding: worker threads report their own actors', async ({ page }) => {
    const result = await capture(page, 'worker-flooding', { workers: 3, messagesPerWorker: 200, payloadBytes: 64 });
    assertInvariants(result, 'worker-flooding');

    expect(workerThreads(result).size).toBe(3);
    expect(result.links.some((link) => link.crossThread)).toBe(true);
    expect(result.messages.some((message) => message.thread.includes('dedicatedWorker'))).toBe(true);
});

test('worker-chain: every hop in the chain is visible', async ({ page }) => {
    const result = await capture(page, 'worker-chain', { chainLength: 4, messages: 30 });
    assertInvariants(result, 'worker-chain');

    expect(workerThreads(result).size).toBe(4);
    expect(result.nodes.filter((node) => node.name === 'relay')).toHaveLength(4);
    expect(result.links.filter((link) => link.crossThread).length).toBeGreaterThanOrEqual(4);
});

test('worker-churn: spawned and terminated workers do not corrupt the graph', async ({ page }) => {
    const result = await capture(page, 'worker-churn', { rounds: 3, workersPerRound: 2, messagesPerWorker: 10 });
    assertInvariants(result, 'worker-churn');

    expect(workerThreads(result).size).toBeGreaterThanOrEqual(4);
    expect(result.nodes.some((node) => node.kind === 'thread-port')).toBe(true);
});

test('channel-storm: channel ports and close envelopes are recorded', async ({ page }) => {
    const result = await capture(page, 'channel-storm', {
        waves: 2,
        channelsPerWave: 20,
        messagesPerChannel: 4,
        aborts: 10,
    });
    assertInvariants(result, 'channel-storm');

    expect(result.nodes.some((node) => node.name === 'openChannel')).toBe(true);
    expect(result.nodes.some((node) => node.name === 'supportChannel')).toBe(true);
    expect(result.nodes.every((node) => node.name !== 'UnknownTransmitter')).toBe(true);

    const closedLinks = result.events.filter((event) => event.type === 'link-closed');
    expect(closedLinks.length).toBeGreaterThan(0);
});

test('actor-supervisor-storm: restarts are attributed to supervisors', async ({ page }) => {
    const result = await capture(page, 'actor-supervisor-storm', { supervisors: 4, restartsPerSupervisor: 3 });
    assertInvariants(result, 'actor-supervisor-storm');

    const restarts = result.events.filter((event) => event.type === 'restart');
    expect(restarts.length).toBe(12);

    const supervisorIds = new Set(result.nodes.filter((node) => node.kind === 'supervisor').map((node) => node.id));
    expect(supervisorIds.size).toBe(4);
    for (const restart of restarts) {
        expect(supervisorIds.has((restart as { id: string }).id), 'restart landed on a non-supervisor node').toBe(true);
    }

    const supervisors = result.snapshot.nodes.filter((node) => node.kind === 'supervisor');
    expect(supervisors.map((node) => node.restarts).sort()).toEqual([3, 3, 3, 3]);
});

test('worker-supervisor-storm: crashing workers restart without dangling nodes', async ({ page }) => {
    const result = await capture(page, 'worker-supervisor-storm', { supervisors: 2, restartsPerSupervisor: 2 });
    assertInvariants(result, 'worker-supervisor-storm');

    expect(result.nodes.filter((node) => node.kind === 'supervisor').length).toBeGreaterThanOrEqual(2);
    expect(result.events.filter((event) => event.type === 'restart').length).toBeGreaterThan(0);
});

test('memory-leak: recorder state stays bounded across churn cycles', async ({ page }) => {
    const result = await capture(page, 'memory-leak', { cycles: 3, actorsPerCycle: 200, messagesPerPair: 4 });
    assertInvariants(result, 'memory-leak');

    expect(result.snapshot.nodes.length).toBeLessThanOrEqual(RECORDER_NODE_CAP);
    expect(result.snapshot.links.length).toBeLessThanOrEqual(8000);

    const closed = result.snapshot.nodes.filter((node) => node.state === 'closed').length;
    expect(closed).toBeGreaterThan(0);
});

test('cross-thread channel: one message stays one message and the channel is visible', async ({ page }) => {
    const result = await capture(page, 'cross-thread-channel', { messages: 1, holdMs: 600 });
    assertInvariants(result, 'cross-thread-channel');

    expect(result.messages.length, 'devtools relay must not amplify traffic').toBeLessThan(200);

    const threads = new Set(result.nodes.map((node) => node.thread));
    expect([...threads].filter((thread) => thread.includes('dedicatedWorker'))).toHaveLength(1);
    expect(result.nodes.some((node) => node.name === 'openChannel')).toBe(true);
    expect(result.nodes.some((node) => node.name === 'supportChannel')).toBe(true);
    expect(result.nodes.some((node) => node.name === 'channel-client')).toBe(true);
    expect(result.nodes.some((node) => node.name === 'channel-host')).toBe(true);
    expect(result.links.some((link) => link.crossThread)).toBe(true);
});

test('live user simulation satisfies the same invariants', async ({ page }) => {
    await page.evaluate(() => window.__simulation.start());
    await page.waitForTimeout(6000);
    await page.evaluate(() => window.__simulation.stop());
    await page.waitForTimeout(200);

    const raw = await page.evaluate(() => {
        window.__WEBACTOR_DEVTOOLS__.flush();
        return {
            events: window.__devtoolsEvents,
            snapshot: window.__WEBACTOR_DEVTOOLS__.snapshot(),
            maxMessages: window.__WEBACTOR_DEVTOOLS__.getOptions().maxMessages,
        };
    });

    const nodes: DevtoolsNode[] = [];
    const links: DevtoolsLink[] = [];
    const messages: DevtoolsMessage[] = [];
    for (const event of raw.events) {
        if (event.type === 'node') nodes.push(event.node);
        if (event.type === 'link') links.push(event.link);
        if (event.type === 'message') messages.push(event.message);
    }

    assertInvariants({ ...raw, nodes, links, messages }, 'simulation');
    expect(messages.length).toBeGreaterThan(20);
    expect(messages.length, 'human-paced activity must not amplify into a message storm').toBeLessThan(20_000);
    expect(nodes.length, 'a human-paced session must not spawn thousands of nodes').toBeLessThan(200);
});
