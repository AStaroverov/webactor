import { expect, test } from '@playwright/test';
import type { DevtoolsEvent, DevtoolsSnapshot } from 'webactor';

function installHook(): void {
    const events: DevtoolsEvent[] = [];
    window.__devtoolsEvents = events;
    window.__WEBACTOR_DEVTOOLS_HOOK__ = {
        onEvents(batch) {
            events.push(...batch);
        },
    };
}

async function readSnapshot(page: import('@playwright/test').Page): Promise<DevtoolsSnapshot> {
    return page.evaluate(() => {
        window.__WEBACTOR_DEVTOOLS__.flush();
        return window.__WEBACTOR_DEVTOOLS__.snapshot();
    });
}

test.beforeEach(async ({ page }) => {
    await page.addInitScript(installHook);
    await page.goto('/');
});

test('devtools hook activates and records the in-page actor graph', async ({ page }) => {
    await page.evaluate(() => window.__loadTest.run('actor-lifecycle', { waves: 1, actorsPerWave: 5 }));

    const snapshot = await readSnapshot(page);

    expect(snapshot.thread).toContain('window');
    expect(snapshot.nodes.length).toBeGreaterThan(0);
    expect(snapshot.nodes.some((node) => node.kind === 'actor')).toBe(true);
    expect(snapshot.messages.length).toBeGreaterThan(0);

    const streamed = await page.evaluate(() => window.__devtoolsEvents.length);
    expect(streamed).toBeGreaterThan(0);
});

test('devtools bridge relays worker-thread actors into the page recorder', async ({ page }) => {
    const result = await page.evaluate(() => window.__loadTest.run('worker-chain', { chainLength: 3, messages: 20 }));
    expect(result.counters.messagesCompleted).toBe(20);

    const snapshot = await readSnapshot(page);
    const threads = new Set(snapshot.nodes.map((node) => node.thread));
    const workerThreads = [...threads].filter((thread) => thread.includes('dedicatedWorker'));

    expect(workerThreads.length).toBe(3);
    expect(snapshot.nodes.filter((node) => node.name === 'relay')).toHaveLength(3);
    expect(snapshot.nodes.some((node) => node.name === 'chain-client')).toBe(true);
    expect(snapshot.nodes.some((node) => node.kind === 'thread-port')).toBe(true);

    const crossLinks = snapshot.links.filter((link) => link.crossThread);
    expect(crossLinks.length).toBeGreaterThan(0);

    const workerMessages = snapshot.messages.filter((message) => message.thread.includes('dedicatedWorker'));
    expect(workerMessages.length).toBeGreaterThan(0);
    expect(workerMessages.every((message) => message.delivered)).toBe(true);

    const relayed = snapshot.messages.find(
        (message) => message.thread.includes('dedicatedWorker') && message.type === 'message',
    );
    expect(relayed?.preview).toMatchObject({ type: 'chain' });
});

test('devtools records supervisor restarts', async ({ page }) => {
    await page.evaluate(() =>
        window.__loadTest.run('actor-supervisor-storm', { supervisors: 3, restartsPerSupervisor: 2 }),
    );

    const snapshot = await readSnapshot(page);
    const supervisors = snapshot.nodes.filter((node) => node.kind === 'supervisor');

    expect(supervisors.length).toBeGreaterThan(0);
    expect(supervisors.some((node) => node.restarts > 0)).toBe(true);
});

test('live user simulation produces a connected multi-thread graph that survives being stopped', async ({ page }) => {
    await page.evaluate(() => window.__simulation.start());
    await page.waitForTimeout(6000);

    const snapshot = await readSnapshot(page);
    const byId = new Map(snapshot.nodes.map((node) => [node.id, node]));
    const named = (name: string) => snapshot.nodes.find((node) => node.name === name);

    for (const name of [
        'app-shell',
        'session',
        'chat-list',
        'chat-view',
        'composer',
        'api-client',
        'storage-client',
        'tab-sync',
    ]) {
        expect(named(name), `node ${name} is missing`).toBeDefined();
    }
    expect(named('api')?.thread).toContain('dedicatedWorker');
    expect(named('storage')?.thread).toContain('dedicatedWorker');
    expect(named('chat-hub')?.thread).toContain('dedicatedWorker');
    expect(named('sync-hub')?.thread).toContain('sharedWorker');
    expect(snapshot.nodes.some((node) => node.kind === 'supervisor')).toBe(true);

    const threads = new Set(snapshot.nodes.map((node) => node.thread));
    expect([...threads].filter((thread) => thread.includes('dedicatedWorker')).length).toBe(3);
    expect([...threads].some((thread) => thread.includes('sharedWorker'))).toBe(true);

    const liveLinks = snapshot.links.filter(
        (link) => byId.get(link.source) !== undefined && byId.get(link.target) !== undefined,
    );
    expect(liveLinks.length).toBeGreaterThan(8);
    expect(snapshot.links.some((link) => link.crossThread)).toBe(true);

    const stats = await page.evaluate(() => window.__simulation.stats());
    expect(stats.running).toBe(true);
    expect(stats.keystrokes).toBeGreaterThan(0);
    expect(stats.chatsOpened).toBeGreaterThan(0);
    expect(stats.analyticsEvents).toBeGreaterThan(0);

    const shellId = named('app-shell')!.id;
    const shellTraffic = snapshot.messages.filter(
        (message) => message.source === shellId || message.target === shellId,
    );
    expect(shellTraffic.length).toBeGreaterThan(0);

    const stopped = await page.evaluate(() => window.__simulation.stop());
    expect(stopped.running).toBe(false);

    await page.waitForTimeout(300);
    const after = await readSnapshot(page);
    const mainThreadActors = after.nodes.filter(
        (node) => node.thread.startsWith('window') && (node.kind === 'actor' || node.kind === 'supervisor'),
    );
    expect(mainThreadActors.length).toBeGreaterThan(0);
    expect(mainThreadActors.every((node) => node.state === 'closed')).toBe(true);

    const staleActors = after.nodes.filter((node) => node.kind === 'actor' && node.state !== 'closed');
    expect(staleActors.every((node) => !node.thread.startsWith('window'))).toBe(true);
});

test('two tabs sharing one SharedWorker both see its actors', async ({ browser }) => {
    const context = await browser.newContext();
    const first = await context.newPage();
    const second = await context.newPage();

    for (const [index, page] of [first, second].entries()) {
        await page.addInitScript(installHook);
        await page.goto('/');
        await page.waitForFunction(() => Boolean(window.__sharedTab));
        await page.evaluate((id) => window.__sharedTab.connect(id), index + 1);
        await page.evaluate(() => window.__sharedTab.send(5));
    }

    await first.waitForTimeout(600);

    for (const [index, page] of [first, second].entries()) {
        const snapshot = await readSnapshot(page);
        const label = `tab ${index + 1}`;

        const hub = snapshot.nodes.find((node) => node.name === 'broadcast-hub');
        expect(hub, `${label}: the shared worker actor is missing`).toBeDefined();
        expect(hub!.thread, `${label}: wrong thread for the shared worker actor`).toContain('sharedWorker');

        expect(
            snapshot.nodes.some((node) => node.name === `tab-${index + 1}`),
            `${label}: its own client actor is missing`,
        ).toBe(true);
        expect(
            snapshot.links.some((link) => link.crossThread),
            `${label}: no cross-thread link to the shared worker`,
        ).toBe(true);
        expect(
            snapshot.messages.some((message) => message.thread.includes('sharedWorker')),
            `${label}: no messages recorded inside the shared worker`,
        ).toBe(true);
    }

    await context.close();
});

test('devtools stays inert without the hook', async ({ browser }) => {
    const clean = await browser.newPage();
    await clean.goto('/');
    await clean.evaluate(() => window.__loadTest.run('actor-lifecycle', { waves: 1, actorsPerWave: 3 }));
    const present = await clean.evaluate(() => '__WEBACTOR_DEVTOOLS__' in window);
    expect(present).toBe(false);
    await clean.close();
});
