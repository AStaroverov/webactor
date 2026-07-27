import { isPageMessage, PANEL_SOURCE, type PageMessage, type PanelCommand } from '../protocol';

type PanelCommandBody = PanelCommand extends infer T ? (T extends PanelCommand ? Omit<T, 'source'> : never) : never;

export type Transport = {
    send: (command: PanelCommandBody) => void;
};

/** Connects to the background worker for the inspected tab and forwards page messages to `onMessage`. */
export function connect(onMessage: (message: PageMessage) => void): Transport {
    const port = chrome.runtime.connect({ name: 'webactor-panel' });
    port.postMessage({ kind: 'init', tabId: chrome.devtools.inspectedWindow.tabId });

    port.onMessage.addListener((message: unknown) => {
        if (isPageMessage(message)) onMessage(message);
    });

    return {
        send(command) {
            port.postMessage({ source: PANEL_SOURCE, ...command } as PanelCommand);
        },
    };
}
