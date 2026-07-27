import { ALL_SITES, hasAccess, originPattern, requestSync } from './permissions';

const site = document.getElementById('site') as HTMLElement;
const state = document.getElementById('state') as HTMLElement;
const toggle = document.getElementById('toggle') as HTMLButtonElement;
const everywhere = document.getElementById('everywhere') as HTMLButtonElement;

/** Opened from the panel the origin comes in the query; opened from the toolbar it is the active tab. */
const asked = new URL(location.href).searchParams.get('origin') ?? undefined;

async function activeTab(): Promise<chrome.tabs.Tab | undefined> {
    if (asked !== undefined) return undefined;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
}

async function render(): Promise<void> {
    const tab = await activeTab();
    const pattern = asked ?? originPattern(tab?.url);
    const all = await hasAccess(ALL_SITES[0]);

    everywhere.textContent = all ? 'Disable everywhere' : 'Enable on all sites';

    if (pattern === undefined) {
        site.textContent = 'this page';
        state.textContent =
            'webactor devtools can only attach to http and https pages. For local files, turn on "Allow access to file URLs" on the extension card in chrome://extensions.';
        toggle.hidden = true;
        return;
    }

    const granted = await hasAccess(pattern);
    site.textContent = new URL(pattern.replace('/*', '')).host;
    state.textContent = granted
        ? 'Enabled. Open DevTools and pick the webactor tab.'
        : 'Not enabled here — nothing is injected into this page.';
    toggle.hidden = false;
    toggle.textContent = granted ? 'Disable on this site' : 'Enable on this site';
    toggle.classList.toggle('primary', !granted);

    toggle.onclick = async () => {
        const changed = granted
            ? await chrome.permissions.remove({ origins: [pattern] })
            : await chrome.permissions.request({ origins: [pattern] });
        if (changed) await done(tab?.id);
        else await render();
    };
}

everywhere.onclick = async () => {
    const all = await hasAccess(ALL_SITES[0]);
    const changed = all
        ? await chrome.permissions.remove({ origins: ALL_SITES })
        : await chrome.permissions.request({ origins: ALL_SITES });
    if (changed) await done((await activeTab())?.id);
    else await render();
};

/** The hook only lands at document_start, so a granted site is useless until the page runs again. */
async function done(tabId: number | undefined): Promise<void> {
    await requestSync().catch(() => {});
    if (tabId !== undefined) await chrome.tabs.reload(tabId);
    window.close();
}

void render();
