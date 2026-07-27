export type GraphTheme = {
    background: string;
    edge: string;
    edgeCross: string;
    label: string;
    labelMuted: string;
    selection: string;
};

export const KIND_COLORS: Record<string, string> = {
    actor: '#5aa9ff',
    retranslator: '#a78bfa',
    supervisor: '#f59e0b',
    'thread-port': '#34d399',
    port: '#64748b',
    unknown: '#94a3b8',
};

export const TYPE_COLORS: Record<string, string> = {
    message: '#7dd3fc',
    close: '#fbbf24',
    error: '#f87171',
};

/** Deliberately outside the node palette, so a flash never reads as a change of kind. */
export const PULSE_COLORS: Record<string, string> = {
    sent: '#e879f9',
    received: '#22d3ee',
    dropped: '#f87171',
};

export function readTheme(): GraphTheme {
    const styles = getComputedStyle(document.documentElement);
    const value = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
    return {
        background: value('--bg-graph', '#17181a'),
        edge: value('--border', '#34363b'),
        edgeCross: '#7c8794',
        label: value('--text', '#e6e6e6'),
        labelMuted: value('--text-muted', '#9aa0a6'),
        selection: value('--accent', '#7cacf8'),
    };
}
