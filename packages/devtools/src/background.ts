import { isPageMessage, isPanelCommand } from './protocol';

const contentPorts = new Map<number, Set<chrome.runtime.Port>>();
const panelPorts = new Map<number, chrome.runtime.Port>();

function addContentPort(tabId: number, port: chrome.runtime.Port): void {
    const ports = contentPorts.get(tabId) ?? new Set();
    ports.add(port);
    contentPorts.set(tabId, ports);
}

function removeContentPort(tabId: number, port: chrome.runtime.Port): void {
    const ports = contentPorts.get(tabId);
    if (ports === undefined) return;
    ports.delete(port);
    if (ports.size === 0) contentPorts.delete(tabId);
}

chrome.runtime.onConnect.addListener((port) => {
    if (port.name === 'webactor-content') {
        const tabId = port.sender?.tab?.id;
        if (tabId === undefined) return;

        addContentPort(tabId, port);
        port.onMessage.addListener((message: unknown) => {
            if (isPageMessage(message)) panelPorts.get(tabId)?.postMessage(message);
        });
        port.onDisconnect.addListener(() => removeContentPort(tabId, port));
        return;
    }

    if (port.name === 'webactor-panel') {
        let tabId: number | undefined;
        port.onMessage.addListener((message: unknown) => {
            const init = message as { kind?: string; tabId?: number };
            if (init.kind === 'init' && typeof init.tabId === 'number') {
                tabId = init.tabId;
                panelPorts.set(tabId, port);
                return;
            }
            if (tabId === undefined || !isPanelCommand(message)) return;
            for (const contentPort of contentPorts.get(tabId) ?? []) {
                try {
                    contentPort.postMessage(message);
                } catch {
                    removeContentPort(tabId, contentPort);
                }
            }
        });
        port.onDisconnect.addListener(() => {
            if (tabId !== undefined) panelPorts.delete(tabId);
        });
    }
});
