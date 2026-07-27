const SCRIPTS: { id: string; js: string[]; world: `${chrome.scripting.ExecutionWorld}` }[] = [
    { id: 'webactor-hook', js: ['hook.js'], world: 'MAIN' },
    { id: 'webactor-content', js: ['content.js'], world: 'ISOLATED' },
];

export const ALL_SITES = ['http://*/*', 'https://*/*'];

const SYNC = { kind: 'webactor-devtools:sync' };

export function isSyncRequest(message: unknown): boolean {
    return (message as typeof SYNC | null)?.kind === SYNC.kind;
}

/** Registration lives in the worker alone, so two contexts can never fight over the same script ids. */
export async function requestSync(): Promise<void> {
    await chrome.runtime.sendMessage(SYNC);
}

export function originPattern(url: string | undefined): string | undefined {
    if (url === undefined) return undefined;
    try {
        const { protocol, origin } = new URL(url);
        return protocol === 'http:' || protocol === 'https:' ? `${origin}/*` : undefined;
    } catch {
        return undefined;
    }
}

export function hasAccess(pattern: string): Promise<boolean> {
    return chrome.permissions.contains({ origins: [pattern] });
}

/**
 * The granted origins are the only source of truth: nothing is injected until the user allows a site,
 * and the hook has to be in place before the page's own scripts, which rules out on-demand injection.
 */
export async function syncRegistrations(): Promise<void> {
    const granted = (await chrome.permissions.getAll()).origins ?? [];
    const registered = await chrome.scripting.getRegisteredContentScripts();
    const ids = registered.map((script) => script.id);

    if (ids.length > 0) await chrome.scripting.unregisterContentScripts({ ids });
    if (granted.length === 0) return;

    await chrome.scripting.registerContentScripts(
        SCRIPTS.map((script) => ({
            ...script,
            matches: granted,
            runAt: 'document_start',
            allFrames: true,
            persistAcrossSessions: true,
        })),
    );
}
