import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type BrowserContext, chromium, expect, test, type Worker } from '@playwright/test';

const distPath = fileURLToPath(new URL('../dist', import.meta.url));
const FIXTURE_URL = `http://localhost:${process.env.PORT ?? 5177}/devtools/tests/fixtures/index.html`;

declare global {
    interface Window {
        __fixture: { received: unknown[] };
    }
}

let context: BrowserContext;
let profile: string;
let extensionPath: string;

/**
 * Nothing is injected until the user allows a site, and a native permission prompt cannot be clicked
 * from a test — so the fixture origin is pre-granted through the manifest of a throwaway copy.
 */
async function grantedCopy(): Promise<string> {
    const copy = await mkdtemp(join(tmpdir(), 'webactor-devtools-dist-'));
    await cp(distPath, copy, { recursive: true });

    const manifestPath = join(copy, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.host_permissions = ['http://localhost/*'];
    await writeFile(manifestPath, JSON.stringify(manifest));

    return copy;
}

function serviceWorker(): Promise<Worker> | Worker {
    return context.serviceWorkers()[0] ?? context.waitForEvent('serviceworker');
}

test.beforeAll(async () => {
    extensionPath = await grantedCopy();
    profile = await mkdtemp(join(tmpdir(), 'webactor-devtools-'));
    context = await chromium.launchPersistentContext(profile, {
        channel: 'chromium',
        args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    });

    const worker = await serviceWorker();
    await expect
        .poll(() => worker.evaluate(async () => (await chrome.scripting.getRegisteredContentScripts()).length), {
            timeout: 5000,
        })
        .toBe(2);
});

test.afterAll(async () => {
    await context?.close();
    await rm(profile, { recursive: true, force: true });
    await rm(extensionPath, { recursive: true, force: true });
});

test('the shipped manifest injects nothing until a site is allowed', async () => {
    const manifest = JSON.parse(await readFile(join(distPath, 'manifest.json'), 'utf8'));
    const pkg = JSON.parse(await readFile(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'));

    expect(manifest.version, 'the store refuses a version it has already seen').toBe(pkg.version);
    expect(manifest.content_scripts, 'static injection would mean access to every site').toBeUndefined();
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.optional_host_permissions).toEqual(['http://*/*', 'https://*/*']);
    expect(manifest.permissions).toEqual(['scripting', 'activeTab']);
});

test('the unpacked extension loads and registers its service worker', async () => {
    const worker = await serviceWorker();
    expect(worker.url()).toContain('background.js');
});

test('an allowed origin gets both scripts at document_start, in the right worlds', async () => {
    const worker = await serviceWorker();
    const scripts = await worker.evaluate(() => chrome.scripting.getRegisteredContentScripts());

    expect(scripts.map((script) => [script.id, script.world, script.runAt, script.matches]).sort()).toEqual([
        ['webactor-content', 'ISOLATED', 'document_start', ['http://localhost/*']],
        ['webactor-hook', 'MAIN', 'document_start', ['http://localhost/*']],
    ]);
});

test('the content script relays page events to the background worker', async () => {
    const worker = await serviceWorker();

    await worker.evaluate(() => {
        (globalThis as unknown as { __seen: unknown[] }).__seen = [];
        chrome.runtime.onConnect.addListener((port) => {
            if (port.name !== 'webactor-content') return;
            port.onMessage.addListener((message) => {
                (globalThis as unknown as { __seen: unknown[] }).__seen.push(message);
            });
        });
    });

    const page = await context.newPage();
    await page.goto(FIXTURE_URL);
    await page.waitForFunction(() => window.__fixture !== undefined);
    await page.evaluate(() => window.postMessage({ source: 'webactor-devtools:panel', kind: 'start' }, '*'));

    await expect
        .poll(() => worker.evaluate(() => (globalThis as unknown as { __seen: unknown[] }).__seen.length), {
            timeout: 5000,
        })
        .toBeGreaterThan(0);

    const kinds = await worker.evaluate(() =>
        ((globalThis as unknown as { __seen: { kind: string }[] }).__seen ?? []).map((message) => message.kind),
    );
    expect(kinds).toContain('status');
    expect(kinds).toContain('events');

    await page.close();
});

test('the hook is injected before page scripts and activates the recorder', async () => {
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(String(error)));

    await page.goto(FIXTURE_URL);
    await page.waitForFunction(() => window.__fixture !== undefined);

    expect(await page.evaluate(() => '__WEBACTOR_DEVTOOLS_HOOK__' in window)).toBe(true);
    expect(await page.evaluate(() => '__WEBACTOR_DEVTOOLS__' in window)).toBe(true);

    const snapshot = await page.evaluate(() => {
        const api = (window as unknown as { __WEBACTOR_DEVTOOLS__: { flush: () => void; snapshot: () => unknown } })
            .__WEBACTOR_DEVTOOLS__;
        api.flush();
        return api.snapshot() as {
            nodes: { name: string; kind: string }[];
            links: unknown[];
            messages: { preview: unknown }[];
        };
    });

    expect(snapshot.nodes.map((node) => node.name).sort()).toEqual(['fixture-consumer', 'fixture-producer']);
    expect(snapshot.links).toHaveLength(1);
    expect(snapshot.messages.at(-1)?.preview).toEqual({ hello: 'world' });
    expect(errors).toEqual([]);

    await page.close();
});
