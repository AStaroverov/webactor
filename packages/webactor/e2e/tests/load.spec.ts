import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import type { ScenarioResult } from '../src/harness';

test.describe.configure({ mode: 'serial' });

let pageErrors: string[] = [];
let allowedPageError: RegExp | null = null;

test.beforeEach(async ({ page }) => {
    pageErrors = [];
    allowedPageError = null;
    page.on('pageerror', (error) => pageErrors.push(String(error)));
    await page.goto('/');
    await page.waitForFunction(() => Boolean(window.__loadTest));
});

test.afterEach(() => {
    expect(pageErrors.filter((error) => !allowedPageError?.test(error))).toEqual([]);
});

function formatResult(result: ScenarioResult): string {
    const lines = [`\n=== ${result.scenario} (${Math.round(result.durationMs)}ms) ===`];
    for (const [key, value] of Object.entries(result.counters)) {
        lines.push(`  ${key}: ${value.toLocaleString('en-US')}`);
    }
    for (const [key, timing] of Object.entries(result.timings)) {
        lines.push(`  ${key}: avg=${timing.avgMs}ms p95=${timing.p95Ms}ms max=${timing.maxMs}ms (n=${timing.count})`);
    }
    if (result.errors.length > 0) {
        lines.push(`  errors: ${JSON.stringify(result.errors)}`);
    }
    return lines.join('\n');
}

async function runScenario(page: Page, name: string, overrides?: Record<string, number>): Promise<ScenarioResult> {
    const result = await page.evaluate(
        ([scenarioName, scenarioOverrides]) => window.__loadTest.run(scenarioName, scenarioOverrides),
        [name, overrides] as [string, Record<string, number> | undefined],
    );
    console.log(formatResult(result));
    return result;
}

test('actor lifecycle: waves of create/exchange/destroy', async ({ page }) => {
    const result = await runScenario(page, 'actor-lifecycle');

    expect(result.errors).toEqual([]);
    expect(result.counters.actorsCreated).toBe(10_000);
    expect(result.counters.repliesReceived).toBe(result.counters.expectedReplies);
    expect(result.counters.creationPerSecond).toBeGreaterThan(2_000);
});

test('channel thrashing: chaotic connect/disconnect keeps delivery exact', async ({ page }) => {
    const result = await runScenario(page, 'channel-thrashing');

    expect(result.errors).toEqual([]);
    expect(result.counters.verificationFailures).toBe(0);
    expect(result.counters.connectionsDestroyed).toBe(result.counters.connectionsCreated);
});

test('message flooding: no lost deliveries under burst load', async ({ page }) => {
    const result = await runScenario(page, 'message-flooding');

    expect(result.errors).toEqual([]);
    expect(result.counters.deliveriesReceived).toBe(result.counters.deliveriesExpected);
    expect(result.counters.deliveriesPerSecond).toBeGreaterThan(10_000);
});

test('port flooding: no lost deliveries over real MessageChannels', async ({ page }) => {
    const result = await runScenario(page, 'port-flooding');

    expect(result.errors).toEqual([]);
    expect(result.counters.deliveriesReceived).toBe(result.counters.deliveriesExpected);
    expect(result.counters.deliveriesPerSecond).toBeGreaterThan(5_000);
});

test('worker flooding: no lost messages across real threads', async ({ page }) => {
    const result = await runScenario(page, 'worker-flooding');

    expect(result.errors).toEqual([]);
    expect(result.counters.messagesDelivered).toBe(result.counters.messagesExpected);
    expect(result.counters.messagesPerSecond).toBeGreaterThan(5_000);
});

test('worker chain: messages traverse deep chain of real threads', async ({ page }) => {
    const result = await runScenario(page, 'worker-chain');

    expect(result.errors).toEqual([]);
    expect(result.counters.messagesCompleted).toBe(result.counters.messagesSent);
    expect(result.counters.maxCheckpointChars).toBeLessThan(50_000);
});

test('worker churn: spawn/kill workers with full echo round-trips', async ({ page }) => {
    const result = await runScenario(page, 'worker-churn');

    expect(result.errors).toEqual([]);
    expect(result.counters.echoesReceived).toBe(result.counters.echoesExpected);
    expect(result.timings.spawnToFirstEcho.p95Ms).toBeLessThan(10_000);
});

test('channel storm: mass open/close and abort storm leak no channels or locks', async ({ page }) => {
    const result = await runScenario(page, 'channel-storm');

    expect(result.errors).toEqual([]);
    expect(result.counters.channelsOpened).toBe(500);
    expect(result.counters.echoesReceived).toBe(result.counters.echoesExpected);
    expect(result.counters.abortsRejected).toBe(result.counters.abortsRequested);
    expect(result.counters.abortsResolved).toBe(0);
    expect(result.counters.supportsLostBeforeHandshake).toBe(result.counters.abortsMidFlight);
    expect(result.counters.leakedChannelLocks).toBe(0);
});

test('actor supervisor storm: restart avalanche leaves no zombie actors', async ({ page }) => {
    const result = await runScenario(page, 'actor-supervisor-storm');

    expect(result.errors).toEqual([]);
    expect(result.counters.constructionsHappened).toBe(result.counters.constructionsExpected);
    expect(result.counters.aliveAfterStorm).toBe(0);
});

test('worker supervisor storm: crashing workers restart and stop cleanly', async ({ page }) => {
    allowedPageError = /intentional crash/;
    const result = await runScenario(page, 'worker-supervisor-storm');

    expect(result.errors).toEqual([]);
    expect(result.counters.spawnsHappened).toBe(result.counters.spawnsExpected);
});

test('shared worker: multi-tab broadcast survives abrupt tab kills', async ({ page, context }) => {
    const TABS = 6;
    const MESSAGES = 200;

    const pages = [page];
    for (let i = 1; i < TABS; i++) {
        const extra = await context.newPage();
        await extra.goto('/');
        await extra.waitForFunction(() => Boolean(window.__sharedTab));
        pages.push(extra);
    }

    for (const [i, tab] of pages.entries()) {
        await tab.evaluate((id) => window.__sharedTab.connect(id), i);
    }
    for (const tab of pages) {
        await tab.evaluate((count) => window.__sharedTab.send(count), MESSAGES);
    }

    const expectedFirst = TABS * MESSAGES;
    for (const tab of pages) {
        await tab.waitForFunction((expected) => window.__sharedTab.stats().received >= expected, expectedFirst, {
            timeout: 30_000,
        });
    }
    await page.waitForTimeout(100);
    for (const tab of pages) {
        expect(await tab.evaluate(() => window.__sharedTab.stats().received)).toBe(expectedFirst);
    }

    const survivors = pages.slice(0, TABS / 2);
    for (const tab of pages.slice(TABS / 2)) {
        await tab.close();
    }

    for (const tab of survivors) {
        await tab.evaluate((count) => window.__sharedTab.send(count), MESSAGES);
    }
    const expectedSecond = expectedFirst + survivors.length * MESSAGES;
    for (const tab of survivors) {
        await tab.waitForFunction((expected) => window.__sharedTab.stats().received >= expected, expectedSecond, {
            timeout: 30_000,
        });
    }
    await page.waitForTimeout(100);
    for (const tab of survivors) {
        expect(await tab.evaluate(() => window.__sharedTab.stats().received)).toBe(expectedSecond);
    }

    console.log(
        `\n=== shared-worker multi-tab ===\n  tabs: ${TABS}, killed: ${TABS - survivors.length}\n  echoes per tab before kill: ${expectedFirst}\n  echoes per survivor after kill: ${expectedSecond}`,
    );
});

test('memory leak: heap does not grow across churn cycles', async ({ page }) => {
    const result = await runScenario(page, 'memory-leak');

    expect(result.errors).toEqual([]);
    test.skip(result.counters.gcAvailable === 0, 'window.gc is not exposed, cannot measure reliably');
    console.log(`  heap growth: ${(result.counters.heapGrowthBytes / 1024 / 1024).toFixed(2)}MB`);
    expect(result.counters.heapGrowthBytes).toBeLessThan(8 * 1024 * 1024);
});
