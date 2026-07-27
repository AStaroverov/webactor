import type { DevtoolsEvent, DevtoolsOptions } from 'webactor';

export const PAGE_SOURCE = 'webactor-devtools:page';
export const PANEL_SOURCE = 'webactor-devtools:panel';

export type PageMessage =
    | { source: typeof PAGE_SOURCE; kind: 'status'; present: boolean; thread: string | null }
    | { source: typeof PAGE_SOURCE; kind: 'events'; events: DevtoolsEvent[] }
    | { source: typeof PAGE_SOURCE; kind: 'reset' };

export type PanelCommand =
    | { source: typeof PANEL_SOURCE; kind: 'start' }
    | { source: typeof PANEL_SOURCE; kind: 'stop' }
    | { source: typeof PANEL_SOURCE; kind: 'clear' }
    | { source: typeof PANEL_SOURCE; kind: 'options'; options: Partial<DevtoolsOptions> };

export type BackgroundMessage = { from: 'page'; payload: PageMessage } | { from: 'panel'; payload: PanelCommand };

export function isPageMessage(value: unknown): value is PageMessage {
    return (value as PageMessage | null)?.source === PAGE_SOURCE;
}

export function isPanelCommand(value: unknown): value is PanelCommand {
    return (value as PanelCommand | null)?.source === PANEL_SOURCE;
}
