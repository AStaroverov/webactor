import { isPageMessage, isPanelCommand } from './protocol';

let port: chrome.runtime.Port | undefined;

function connect(): chrome.runtime.Port | undefined {
    try {
        const created = chrome.runtime.connect({ name: 'webactor-content' });
        created.onMessage.addListener((message: unknown) => {
            if (isPanelCommand(message)) window.postMessage(message, '*');
        });
        created.onDisconnect.addListener(() => {
            port = undefined;
        });
        return created;
    } catch {
        return undefined;
    }
}

port = connect();

window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== window) return;
    if (!isPageMessage(event.data)) return;
    if (port === undefined) port = connect();
    try {
        port?.postMessage(event.data);
    } catch {
        port = undefined;
    }
});
