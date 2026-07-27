import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';
import type { DevtoolsEvent, DevtoolsMessage } from 'webactor';
import { PAGE_SOURCE } from '../src/protocol';

const PANEL_URL = `file://${fileURLToPath(new URL('../dist/panel.html', import.meta.url))}`;

declare global {
    interface Window {
        __panelSent: unknown[];
        __panelReceive: (message: unknown) => void;
        __webactorPanel: {
            store: { nodes: Map<string, unknown>; links: Map<string, unknown>; messages: unknown[] };
            graph: {
                selected: string | undefined;
                dimUnwatched: boolean;
                debugEdges: () => { source: string; target: string; collapsed: boolean; closed: boolean }[];
                debugPulses: () => [string, Record<string, number>][];
            };
            select: (id: string | undefined) => void;
            showPane: (pane: 'actor' | 'global' | 'channels') => void;
            setFilter: (query: string) => void;
            pinnedFields: () => string[];
            selectChannel: (channelId: string | undefined) => void;
        };
        __accessDenied?: boolean;
        __access: { denied: boolean; grant: () => void; reloads: number; asked: number };
    }
}

function stubChrome(): void {
    const listeners: ((message: unknown) => void)[] = [];
    const granted: VoidFunction[] = [];
    window.__panelSent = [];
    window.__panelReceive = (message) => listeners.forEach((listener) => listener(message));
    window.__access = {
        denied: window.__accessDenied === true,
        grant: () => {
            window.__access.denied = false;
            granted.forEach((listener) => listener());
        },
        reloads: 0,
        asked: 0,
    };

    (window as unknown as { chrome: unknown }).chrome = {
        runtime: {
            connect: () => ({
                postMessage: (message: unknown) => window.__panelSent.push(message),
                onMessage: { addListener: (listener: (message: unknown) => void) => listeners.push(listener) },
                onDisconnect: { addListener: () => {} },
            }),
            sendMessage: () => Promise.resolve(true),
            getURL: (path: string) => `chrome-extension://stub/${path}`,
        },
        devtools: {
            inspectedWindow: {
                tabId: 7,
                eval: (_expression: string, callback: (result: unknown) => void) => callback('http://localhost/app'),
                reload: () => {
                    window.__access.reloads += 1;
                },
            },
            network: { onNavigated: { addListener: () => {} } },
        },
        permissions: {
            contains: () => Promise.resolve(!window.__access.denied),
            onAdded: { addListener: (listener: VoidFunction) => granted.push(listener) },
            onRemoved: { addListener: () => {} },
        },
        windows: {
            create: () => {
                window.__access.asked += 1;
                return Promise.resolve({});
            },
        },
    };
}

const NODE_A = 'producer<window<t1>-1>';
const NODE_B = 'consumer<window<t1>-2>';
const NODE_C = 'echo<worker<t2>-3>';

function graphEvents(): DevtoolsEvent[] {
    const node = (id: string, name: string, thread: string, kind: 'actor' | 'port') => ({
        type: 'node' as const,
        node: {
            id,
            name,
            kind,
            state: 'launched' as const,
            thread,
            createdAt: 1_700_000_000_000,
            restarts: 0,
        },
    });

    return [
        node(NODE_A, 'producer', 'window<t1>', 'actor'),
        node(NODE_B, 'consumer', 'window<t1>', 'actor'),
        node(NODE_C, 'echo', 'worker<t2>', 'actor'),
        {
            type: 'link',
            link: {
                id: `${NODE_A}|${NODE_B}`,
                source: NODE_A,
                target: NODE_B,
                thread: 'window<t1>',
                types: ['message'],
                crossThread: false,
                createdAt: 1_700_000_000_000,
            },
        },
        {
            type: 'link',
            link: {
                id: `${NODE_B}|${NODE_C}`,
                source: NODE_B,
                target: NODE_C,
                thread: 'window<t1>',
                types: ['message'],
                crossThread: true,
                createdAt: 1_700_000_000_000,
            },
        },
        {
            type: 'message',
            message: {
                seq: 'window<t1>:1',
                ts: 1_700_000_000_100,
                source: NODE_A,
                target: NODE_B,
                thread: 'window<t1>',
                type: 'message',
                delivered: true,
                route: undefined,
                checkpoints: 'producer/consumer',
                bytes: 42,
                preview: { kind: 'ping', payload: { nested: [1, 2, 3] } },
            },
        },
        {
            type: 'message',
            message: {
                seq: 'window<t1>:2',
                ts: 1_700_000_000_200,
                source: NODE_B,
                target: NODE_A,
                thread: 'window<t1>',
                type: 'close',
                delivered: false,
                route: 'nowhere',
                checkpoints: 'consumer/producer',
                bytes: 12,
                preview: { reason: 'Close' },
            },
        },
    ];
}

const PORT_ID = 'MessagePort<window<t1>-9>';
const WORKER_PORT_ID = 'MessagePort<worker<t2>-10>';

/** consumer ── port ══ port ── echo: the shape every worker connection has, with both ports hidden. */
function portBridgeEvents(): DevtoolsEvent[] {
    const port = (id: string, thread: string): DevtoolsEvent => ({
        type: 'node',
        node: {
            id,
            name: 'MessagePort',
            kind: 'port',
            state: 'created',
            thread,
            createdAt: 1_700_000_000_000,
            restarts: 0,
        },
    });
    const link = (source: string, target: string, thread: string, crossThread: boolean): DevtoolsEvent => ({
        type: 'link',
        link: {
            id: `${source}|${target}`,
            source,
            target,
            thread,
            types: ['message'],
            crossThread,
            createdAt: 1_700_000_000_000,
        },
    });

    return [
        ...graphEvents().filter((event) => event.type !== 'link' || !event.link.crossThread),
        port(PORT_ID, 'window<t1>'),
        port(WORKER_PORT_ID, 'worker<t2>'),
        link(NODE_B, PORT_ID, 'window<t1>', false),
        link(PORT_ID, WORKER_PORT_ID, 'window<t1>', true),
        link(WORKER_PORT_ID, NODE_C, 'worker<t2>', false),
    ];
}

async function openPanel(page: Page): Promise<string[]> {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    await page.addInitScript(stubChrome);
    await page.goto(PANEL_URL);
    await page.waitForFunction(() => window.__webactorPanel !== undefined);
    return errors;
}

async function feed(page: Page, events: DevtoolsEvent[]): Promise<void> {
    await page.evaluate(
        ([source, batch]) => {
            window.__panelReceive({ source, kind: 'events', events: batch });
        },
        [PAGE_SOURCE, events] as const,
    );
}

test('the access bar asks in a window of its own and clears once the site is allowed', async ({ page }) => {
    await page.addInitScript(() => {
        window.__accessDenied = true;
    });
    const errors = await openPanel(page);

    await expect(page.locator('#access')).toBeVisible();
    await expect(page.locator('#access-grant')).toBeVisible();

    await page.click('#access-grant');
    expect(await page.evaluate(() => window.__access.asked), 'a panel cannot prompt for permissions itself').toBe(1);

    await page.evaluate(() => window.__access.grant());

    await expect(page.locator('#access')).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.__access.reloads), { timeout: 2000 }).toBe(1);
    expect(errors).toEqual([]);
});

test('panel connects, announces itself and asks the page to start streaming', async ({ page }) => {
    const errors = await openPanel(page);
    const sent = await page.evaluate(() => window.__panelSent);

    expect(sent[0]).toEqual({ kind: 'init', tabId: 7 });
    expect(sent).toContainEqual({ source: PAGE_SOURCE.replace(':page', ':panel'), kind: 'start' });
    expect(errors).toEqual([]);
});

test('panel builds the graph, renders it and lists messages per actor', async ({ page }) => {
    const errors = await openPanel(page);
    await feed(page, graphEvents());

    await expect(page.locator('#counts')).toContainText('3 nodes');
    await expect(page.locator('#counts')).toContainText('2 links');
    await expect(page.locator('#counts')).toContainText('2 messages');

    const threads = await page.locator('#thread option').allTextContents();
    expect(threads).toEqual(['all threads', 'window<t1>', 'worker<t2>']);

    await page.evaluate((id) => window.__webactorPanel.select(id), NODE_A);
    await expect(page.locator('#node-header .title')).toHaveText('producer');
    await expect(page.locator('#node-header')).toContainText('actor');

    const rows = page.locator('#messages .message');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText('consumer');
    await expect(rows.nth(1)).toHaveClass(/dropped/);

    await rows.nth(0).click();
    await expect(page.locator('#payload-view')).toContainText('kind');
    await expect(page.locator('#payload-view')).toContainText('"ping"');
    await expect(page.locator('#payload-view')).toContainText('nested');

    expect(errors).toEqual([]);
});

test('direction tabs filter incoming and outgoing messages', async ({ page }) => {
    await openPanel(page);
    await feed(page, graphEvents());
    await page.evaluate((id) => window.__webactorPanel.select(id), NODE_A);

    await page.locator('.tabs button[data-direction="out"]').click();
    await expect(page.locator('#messages .message')).toHaveCount(1);
    await expect(page.locator('#filter-count')).toHaveText('1 of 2');

    await page.locator('.tabs button[data-direction="in"]').click();
    await expect(page.locator('#messages .message')).toHaveCount(1);

    await page.locator('.tabs button[data-direction="all"]').click();
    await expect(page.locator('#messages .message')).toHaveCount(2);
});

test('the pane follows the selection: an actor opens Actor, empty canvas opens Global', async ({ page }) => {
    await openPanel(page);
    await feed(page, graphEvents());
    await page.waitForTimeout(600);

    await expect(page.locator('#pane-global'), 'nothing selected yet').toHaveClass(/active/);

    await page.evaluate((id) => window.__webactorPanel.select(id), NODE_A);
    await expect(page.locator('#pane-actor')).toHaveClass(/active/);
    await expect(page.locator('#pane-actor-view')).toBeVisible();

    await page.locator('#pane-global').click();
    await page.evaluate((id) => window.__webactorPanel.select(id), NODE_B);
    await expect(page.locator('#pane-actor'), 'picking an actor always returns to Actor').toHaveClass(/active/);

    const box = (await page.locator('#canvas').boundingBox())!;
    await page.mouse.click(box.x + 6, box.y + 6);
    await expect(page.locator('#pane-global'), 'clicking past every node opens Global').toHaveClass(/active/);
    await expect(page.locator('#node-header')).toContainText('select an actor');
});

test('clicking an endpoint in the global list opens the Actor pane on that actor', async ({ page }) => {
    await openPanel(page);
    await feed(page, graphEvents());
    await page.locator('#pane-global').click();

    await page.locator('#global-list .global-row').first().locator('.endpoint').nth(1).click();

    await expect(page.locator('#pane-actor')).toHaveClass(/active/);
    await expect(page.locator('#node-header .title')).toHaveText('consumer');
});

test('clicking a node where it is drawn selects that node', async ({ page }) => {
    await openPanel(page);
    await feed(page, graphEvents());
    await page.waitForTimeout(600);

    const target = await page.evaluate((id) => {
        const graph = window.__webactorPanel.graph as unknown as {
            screenOf: (id: string) => { x: number; y: number } | undefined;
        };
        return graph.screenOf(id);
    }, NODE_A);
    expect(target).toBeDefined();

    const box = (await page.locator('#canvas').boundingBox())!;
    await page.mouse.click(box.x + target!.x, box.y + target!.y);

    await expect(page.locator('#node-header .title')).toHaveText('producer');
    expect(await page.evaluate(() => window.__webactorPanel.graph.selected)).toBe(NODE_A);
});

test('ports are never drawn, and collapse into pass-through edges instead', async ({ page }) => {
    await openPanel(page);
    await feed(page, portBridgeEvents());
    await page.waitForTimeout(200);

    const collapsed = await page.evaluate(() => window.__webactorPanel.graph.debugEdges());
    const between = collapsed.find(
        (edge) =>
            (edge.source === NODE_B && edge.target === NODE_C) || (edge.source === NODE_C && edge.target === NODE_B),
    );
    expect(between, 'consumer and echo must stay connected through the two hidden ports').toBeDefined();
    expect(between!.collapsed).toBe(true);
    expect(collapsed.some((edge) => edge.source === PORT_ID || edge.target === PORT_ID)).toBe(false);
});

/** Long enough for the flashes the fixture itself caused to have faded out. */
const PULSE_FADED = 700;

function hopMessage(source: string, target: string, seq: string, delivered = true): DevtoolsMessage {
    return {
        seq,
        ts: 1_700_000_000_300,
        source,
        target,
        thread: 'window<t1>',
        type: 'message',
        delivered,
        route: delivered ? undefined : 'nowhere',
        checkpoints: 'consumer/echo',
        bytes: 8,
        preview: undefined,
    };
}

function hopEvent(source: string, target: string, seq: string, delivered = true): DevtoolsEvent {
    return { type: 'message', message: hopMessage(source, target, seq, delivered) };
}

test('a hop lights up the two nodes it touches, sender and receiver differently', async ({ page }) => {
    await openPanel(page);
    await feed(page, graphEvents());
    await page.waitForTimeout(PULSE_FADED);

    await feed(page, [hopEvent(NODE_A, NODE_B, 'window<t1>:3'), hopEvent(NODE_B, NODE_A, 'window<t1>:4', false)]);

    const pulses = new Map(await page.evaluate(() => window.__webactorPanel.graph.debugPulses()));

    expect(pulses.get(NODE_A)!.sent, 'the sender must light up as sending').toBeGreaterThan(0);
    expect(pulses.get(NODE_B)!.received, 'the receiver must light up as receiving').toBeGreaterThan(0);
    expect(pulses.get(NODE_A)!.dropped, 'an undelivered envelope must light its target up as dropped').toBeGreaterThan(
        0,
    );
    expect(pulses.get(NODE_C), 'an untouched node must stay dark').toBeUndefined();
});

test('a hop into a hidden port lights up only the visible end', async ({ page }) => {
    await openPanel(page);
    await feed(page, portBridgeEvents());
    await page.waitForTimeout(PULSE_FADED);

    await feed(page, [hopEvent(NODE_B, PORT_ID, 'window<t1>:5')]);

    const pulses = new Map(await page.evaluate(() => window.__webactorPanel.graph.debugPulses()));

    expect(pulses.get(NODE_B)!.sent).toBeGreaterThan(0);
    expect(pulses.get(PORT_ID), 'a collapsed port has nothing to light up').toBeUndefined();
});

test('flashes stop being recorded once they are switched off', async ({ page }) => {
    await openPanel(page);
    await feed(page, graphEvents());
    await page.waitForTimeout(PULSE_FADED);
    await page.locator('#flash').uncheck();

    await feed(page, [hopEvent(NODE_A, NODE_B, 'window<t1>:6')]);

    expect(await page.evaluate(() => window.__webactorPanel.graph.debugPulses())).toEqual([]);
});

test('closed links stay visible as history instead of vanishing', async ({ page }) => {
    await openPanel(page);
    await feed(page, graphEvents());

    await feed(page, [{ type: 'link-closed', id: `${NODE_A}|${NODE_B}`, ts: Date.now() }]);
    await page.waitForTimeout(200);

    const edges = await page.evaluate(() => window.__webactorPanel.graph.debugEdges());
    const closed = edges.find((edge) => edge.source === NODE_A && edge.target === NODE_B);
    expect(closed).toBeDefined();
    expect(closed!.closed).toBe(true);
    await expect(page.locator('#counts')).toContainText('1 links');
});

test('the global pane lists every matching message with both endpoints', async ({ page }) => {
    const errors = await openPanel(page);
    await feed(page, graphEvents());

    await page.locator('#pane-global').click();
    await expect(page.locator('#pane-global-view')).toBeVisible();
    await expect(page.locator('#pane-actor-view')).toBeHidden();

    const rows = page.locator('#global-list .global-row');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText('producer');
    await expect(rows.nth(0)).toContainText('consumer');
    await expect(page.locator('#filter-count')).toContainText('2 captured');

    await rows.nth(0).click();
    await expect(page.locator('#payload-view')).toContainText('"ping"');

    expect(errors).toEqual([]);
});

test('the filter narrows by payload, direction, type and delivery', async ({ page }) => {
    await openPanel(page);
    await feed(page, graphEvents());
    await page.locator('#pane-global').click();

    const rows = page.locator('#global-list .global-row');

    await page.evaluate(() => window.__webactorPanel.setFilter('ping'));
    await expect(rows).toHaveCount(1);
    await expect(rows.nth(0)).toContainText('producer');
    await expect(page.locator('#filter-count')).toHaveText('1 of 2');

    await page.evaluate(() => window.__webactorPanel.setFilter('from:consumer'));
    await expect(rows).toHaveCount(1);
    await expect(rows.nth(0)).toHaveClass(/dropped/);

    await page.evaluate(() => window.__webactorPanel.setFilter('type:close'));
    await expect(rows).toHaveCount(1);

    await page.evaluate(() => window.__webactorPanel.setFilter('dropped'));
    await expect(rows).toHaveCount(1);

    await page.evaluate(() => window.__webactorPanel.setFilter('from:producer dropped'));
    await expect(rows).toHaveCount(0);
    await expect(page.locator('#global-list')).toContainText('nothing matches');

    await page.evaluate(() => window.__webactorPanel.setFilter('nested'));
    await expect(rows).toHaveCount(1);
});

function payloadRow(page: Page, key: string) {
    return page
        .locator('#payload-view .tree-row')
        .filter({ hasText: `${key}:` })
        .first();
}

async function pinPayloadField(page: Page, key: string, row = 0): Promise<void> {
    await page.evaluate((id) => window.__webactorPanel.select(id), NODE_A);
    await page.locator('#messages .message').nth(row).click();
    await payloadRow(page, key).locator('.tree-watch').click();
}

test('watching a payload field pins it as a chip and keeps only envelopes carrying that value', async ({ page }) => {
    await openPanel(page);
    await feed(page, graphEvents());
    await feed(page, [
        {
            type: 'message',
            message: {
                seq: 'window<t1>:7',
                ts: 1_700_000_000_400,
                source: NODE_A,
                target: NODE_B,
                thread: 'window<t1>',
                type: 'message',
                delivered: true,
                route: undefined,
                checkpoints: 'producer/consumer',
                bytes: 20,
                preview: { kind: 'pong', payload: { nested: [9] } },
            },
        },
    ]);

    await pinPayloadField(page, 'kind');

    await expect(page.locator('#pane-actor')).toHaveClass(/active/);
    await expect(page.locator('#filter-chips .chip')).toHaveCount(1);
    await expect(page.locator('#filter-chips .chip-label')).toHaveText('kind = "ping"');
    await expect(page.locator('#filter-chips .chip-count')).toHaveText('1');
    expect(await page.evaluate(() => window.__webactorPanel.pinnedFields())).toEqual(['kind="ping"']);

    await expect(page.locator('#messages .message'), 'the same filter narrows the actor pane').toHaveCount(1);

    await page.locator('#pane-global').click();
    await expect(page.locator('#global-list .global-row')).toHaveCount(1);
});

test('a chip on a non-primitive field compares the whole subtree', async ({ page }) => {
    await openPanel(page);
    await feed(page, graphEvents());

    await pinPayloadField(page, 'payload');

    await expect(page.locator('#filter-chips .chip-label')).toHaveText('payload = {"nested":[1,2,3]}');
    await expect(page.locator('#messages .message')).toHaveCount(1);
});

test('chips combine with OR while the typed query narrows them', async ({ page }) => {
    await openPanel(page);
    await feed(page, graphEvents());
    await feed(page, [
        {
            type: 'message',
            message: {
                ...hopMessage(NODE_A, NODE_B, 'window<t1>:9'),
                preview: { kind: 'pong', payload: { nested: [1, 2, 3] } },
            },
        },
    ]);

    await pinPayloadField(page, 'kind');
    await expect(page.locator('#messages .message')).toHaveCount(1);

    await pinPayloadField(page, 'payload');
    await expect(page.locator('#filter-chips .chip')).toHaveCount(2);
    await expect(
        page.locator('#messages .message'),
        'the second chip widens the set, it does not narrow it',
    ).toHaveCount(2);

    await page.evaluate(() => window.__webactorPanel.setFilter('pong'));
    await expect(page.locator('#messages .message')).toHaveCount(1);

    await page.locator('#filter-chips .chip').nth(1).locator('.chip-remove').click();
    await expect(page.locator('#filter-chips .chip')).toHaveCount(1);
    await expect(page.locator('#messages .message'), 'only "ping" is left and it is not a "pong"').toHaveCount(0);
});

test('an active filter dims the graph and marks the nodes it touches', async ({ page }) => {
    await openPanel(page);
    await feed(page, graphEvents());
    await page.waitForTimeout(PULSE_FADED);

    expect(await page.evaluate(() => window.__webactorPanel.graph.dimUnwatched)).toBe(false);

    await pinPayloadField(page, 'kind');
    expect(await page.evaluate(() => window.__webactorPanel.graph.dimUnwatched)).toBe(true);

    await feed(page, [
        { type: 'message', message: { ...hopMessage(NODE_A, NODE_B, 'window<t1>:8'), preview: { kind: 'ping' } } },
    ]);

    const pulses = new Map(await page.evaluate(() => window.__webactorPanel.graph.debugPulses()));
    expect(pulses.get(NODE_A)!.watched, 'an envelope under the filter must mark its sender').toBeGreaterThan(0);
    expect(pulses.get(NODE_B)!.watched).toBeGreaterThan(0);

    await page.locator('#filter-chips .chip-remove').click();
    expect(await page.evaluate(() => window.__webactorPanel.graph.dimUnwatched)).toBe(false);
});

const CHANNEL_ID = 'ab12cd';

function channelEvents(): DevtoolsEvent[] {
    const side = (
        sideName: 'open' | 'support',
        thread: string,
        ownerId: string,
        endpointId: string,
    ): DevtoolsEvent => ({
        type: 'channel',
        channel: {
            id: `${CHANNEL_ID}:${sideName}`,
            channelId: CHANNEL_ID,
            side: sideName,
            name: 'chat',
            thread,
            state: 'open',
            ownerId,
            endpointId,
            createdAt: 1_700_000_000_000,
        },
    });

    const hop = (seq: string, source: string, target: string, channel?: string): DevtoolsEvent => ({
        type: 'message',
        message: { ...hopMessage(source, target, seq), preview: { text: 'hi' }, channel },
    });

    return [
        ...graphEvents(),
        side('open', 'window<t1>', NODE_A, NODE_A),
        side('support', 'worker<t2>', NODE_C, NODE_C),
        hop('window<t1>:20', NODE_A, NODE_B, CHANNEL_ID),
        hop('window<t1>:21', NODE_B, NODE_A, CHANNEL_ID),
        hop('window<t1>:22', NODE_A, NODE_B),
    ];
}

test('the channels pane pairs both sides of a channel and lists what travelled it', async ({ page }) => {
    const errors = await openPanel(page);
    await feed(page, channelEvents());

    await page.locator('#pane-channels').click();
    await expect(page.locator('#pane-channels-view')).toBeVisible();

    const rows = page.locator('#channels-list .channel-row');
    await expect(rows, 'two sides are one channel').toHaveCount(1);
    await expect(rows.first().locator('.channel-name')).toHaveText('chat');
    await expect(rows.first().locator('.channel-flow')).toContainText('producer');
    await expect(rows.first().locator('.channel-flow')).toContainText('echo');
    await expect(rows.first().locator('.channel-meta')).toHaveText('2 msg');
    await expect(page.locator('#channels-count')).toHaveText('1 open of 1');
    await expect(page.locator('#channel-traffic')).toContainText('select a channel');

    await rows.first().click();
    await expect(page.locator('#channel-traffic .global-row'), 'only this channel travels here').toHaveCount(2);

    await page.locator('#channel-traffic .global-row').first().click();
    await expect(page.locator('#payload-view')).toContainText('"hi"');

    expect(errors).toEqual([]);
});

test('a closed channel stays in the list carrying its reason', async ({ page }) => {
    await openPanel(page);
    await feed(page, channelEvents());
    await page.locator('#pane-channels').click();

    await feed(page, [
        { type: 'channel-state', id: `${CHANNEL_ID}:open`, state: 'closed', ts: Date.now(), reason: 'LostConnection' },
    ]);

    const row = page.locator('#channels-list .channel-row').first();
    await expect(row).toHaveClass(/state-closed/);
    await expect(row.locator('.channel-meta')).toHaveText('closed · LostConnection');
    await expect(page.locator('#channels-count'), 'it is still listed, just not open').toHaveText('0 open of 1');
});

test('the shared filter narrows a channel traffic list too', async ({ page }) => {
    await openPanel(page);
    await feed(page, channelEvents());
    await page.evaluate((id) => window.__webactorPanel.selectChannel(id), CHANNEL_ID);

    await expect(page.locator('#channel-traffic .global-row')).toHaveCount(2);

    await page.evaluate(() => window.__webactorPanel.setFilter('from:producer'));
    await expect(page.locator('#channel-traffic .global-row')).toHaveCount(1);
});

test('the canvas actually paints the graph', async ({ page }) => {
    const errors = await openPanel(page);
    await feed(page, graphEvents());
    await page.waitForTimeout(400);

    const painted = await page.evaluate(() => {
        const canvas = document.getElementById('canvas') as HTMLCanvasElement;
        const context = canvas.getContext('2d')!;
        const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
        const colors = new Set<string>();
        for (let i = 0; i < data.length; i += 4) colors.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
        return colors.size;
    });

    expect(painted).toBeGreaterThan(3);
    expect(errors).toEqual([]);
});

test('toolbar controls forward commands to the page', async ({ page }) => {
    await openPanel(page);
    await page.evaluate(() => (window.__panelSent.length = 0));

    await page.locator('#record').click();
    await page.locator('#clear').click();
    await page.locator('#payload').uncheck();

    const sent = (await page.evaluate(() => window.__panelSent)) as { kind: string; options?: unknown }[];
    expect(sent.map((message) => message.kind)).toEqual(['stop', 'clear', 'options']);
    expect(sent[2].options).toEqual({ capturePayload: false });
    await expect(page.locator('#record-label')).toHaveText('Paused');
});

test('reset clears the captured graph', async ({ page }) => {
    await openPanel(page);
    await feed(page, graphEvents());
    await expect(page.locator('#counts')).toContainText('3 nodes');

    await page.evaluate((source) => window.__panelReceive({ source, kind: 'reset' }), PAGE_SOURCE);

    const sizes = await page.evaluate(() => ({
        nodes: window.__webactorPanel.store.nodes.size,
        messages: window.__webactorPanel.store.messages.length,
    }));
    expect(sizes).toEqual({ nodes: 0, messages: 0 });
    await expect(page.locator('#node-header')).toContainText('select an actor');
});
