import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';
import type { DevtoolsEvent } from 'webactor';
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
                debugEdges: () => { source: string; target: string; collapsed: boolean; closed: boolean }[];
            };
            select: (id: string | undefined) => void;
        };
    }
}

function stubChrome(): void {
    const listeners: ((message: unknown) => void)[] = [];
    window.__panelSent = [];
    window.__panelReceive = (message) => listeners.forEach((listener) => listener(message));

    (window as unknown as { chrome: unknown }).chrome = {
        runtime: {
            connect: () => ({
                postMessage: (message: unknown) => window.__panelSent.push(message),
                onMessage: { addListener: (listener: (message: unknown) => void) => listeners.push(listener) },
                onDisconnect: { addListener: () => {} },
            }),
        },
        devtools: {
            inspectedWindow: { tabId: 7 },
            network: { onNavigated: { addListener: () => {} } },
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
    await expect(page.locator('#message-count')).toHaveText('1 of 2');

    await page.locator('.tabs button[data-direction="in"]').click();
    await expect(page.locator('#messages .message')).toHaveCount(1);

    await page.locator('.tabs button[data-direction="all"]').click();
    await expect(page.locator('#messages .message')).toHaveCount(2);
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

test('hiding ports keeps the graph connected by collapsing them into pass-through edges', async ({ page }) => {
    await openPanel(page);

    const portId = 'MessagePort<window<t1>-9>';
    const workerPortId = 'MessagePort<worker<t2>-10>';
    const events = graphEvents().filter((event) => event.type !== 'link' || !event.link.crossThread);

    await feed(page, [
        ...events,
        {
            type: 'node',
            node: {
                id: portId,
                name: 'MessagePort',
                kind: 'port',
                state: 'created',
                thread: 'window<t1>',
                createdAt: 1_700_000_000_000,
                restarts: 0,
            },
        },
        {
            type: 'node',
            node: {
                id: workerPortId,
                name: 'MessagePort',
                kind: 'port',
                state: 'created',
                thread: 'worker<t2>',
                createdAt: 1_700_000_000_000,
                restarts: 0,
            },
        },
        {
            type: 'link',
            link: {
                id: `${NODE_B}|${portId}`,
                source: NODE_B,
                target: portId,
                thread: 'window<t1>',
                types: ['message'],
                crossThread: false,
                createdAt: 1_700_000_000_000,
            },
        },
        {
            type: 'link',
            link: {
                id: `${portId}|${workerPortId}`,
                source: portId,
                target: workerPortId,
                thread: 'window<t1>',
                types: ['message'],
                crossThread: true,
                createdAt: 1_700_000_000_000,
            },
        },
        {
            type: 'link',
            link: {
                id: `${workerPortId}|${NODE_C}`,
                source: workerPortId,
                target: NODE_C,
                thread: 'worker<t2>',
                types: ['message'],
                crossThread: false,
                createdAt: 1_700_000_000_000,
            },
        },
    ]);
    await page.waitForTimeout(200);

    const collapsed = await page.evaluate(() => window.__webactorPanel.graph.debugEdges());
    const between = collapsed.find(
        (edge) =>
            (edge.source === NODE_B && edge.target === NODE_C) || (edge.source === NODE_C && edge.target === NODE_B),
    );
    expect(between, 'consumer and echo must stay connected through the two hidden ports').toBeDefined();
    expect(between!.collapsed).toBe(true);
    expect(collapsed.some((edge) => edge.source === portId || edge.target === portId)).toBe(false);

    await page.locator('#ports').check();
    await page.waitForTimeout(200);

    const expanded = await page.evaluate(() => window.__webactorPanel.graph.debugEdges());
    expect(expanded.every((edge) => !edge.collapsed)).toBe(true);
    expect(expanded.some((edge) => edge.source === portId || edge.target === portId)).toBe(true);
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
