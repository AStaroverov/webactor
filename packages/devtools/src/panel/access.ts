import { hasAccess, originPattern, requestSync } from '../permissions';
import { dom } from './elements';

const NOT_ATTACHED = 'webactor devtools is not attached to this page — nothing is injected until you allow it.';
const FILE_HINT =
    'For file:// pages, turn on "Allow access to file URLs" on the extension card in chrome://extensions.';

let pattern: string | undefined;
let blocked = false;

function inspectedUrl(): Promise<string | undefined> {
    return new Promise((resolve) => {
        chrome.devtools.inspectedWindow.eval('location.href', (result: unknown) => {
            resolve(typeof result === 'string' ? result : undefined);
        });
    });
}

function show(text: string | undefined, grantable = false): void {
    dom.accessBar.hidden = text === undefined;
    dom.accessText.textContent = text ?? '';
    dom.accessGrant.hidden = !grantable;
}

export async function refreshAccess(): Promise<void> {
    const url = await inspectedUrl();
    pattern = originPattern(url);

    if (pattern === undefined) {
        blocked = false;
        show(url?.startsWith('file:') === true ? FILE_HINT : undefined);
        return;
    }

    const granted = await hasAccess(pattern);
    const justGranted = granted && blocked;

    blocked = !granted;
    show(granted ? undefined : NOT_ATTACHED, !granted);

    if (!justGranted) return;
    await requestSync().catch(() => {});
    chrome.devtools.inspectedWindow.reload({});
}

/**
 * A devtools panel is not a reliable user-gesture context for permissions.request, so the ask happens in
 * the extension's own window; granting it fires permissions.onAdded, which is what clears the bar here.
 */
function ask(): void {
    if (pattern === undefined) return;
    void chrome.windows.create({
        url: `${chrome.runtime.getURL('popup.html')}?origin=${encodeURIComponent(pattern)}`,
        type: 'popup',
        width: 320,
        height: 200,
    });
}

export function watchAccess(): void {
    dom.accessGrant.addEventListener('click', ask);
    chrome.permissions.onAdded.addListener(() => void refreshAccess());
    chrome.permissions.onRemoved.addListener(() => void refreshAccess());
    void refreshAccess();
}
