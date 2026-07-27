import type { FieldChip } from '../chips';

export type ChipListInput = {
    container: HTMLElement;
    chips: readonly FieldChip[];
    counts: Map<string, number>;
    onRemove: (id: string) => void;
    onClear: VoidFunction;
};

function chipElement(chip: FieldChip, count: number, onRemove: (id: string) => void): HTMLElement {
    const element = document.createElement('span');
    element.className = 'chip';
    element.title = chip.label;

    const label = document.createElement('span');
    label.className = 'chip-label';
    label.textContent = chip.label;

    const badge = document.createElement('span');
    badge.className = 'chip-count';
    badge.textContent = String(count);

    const remove = document.createElement('button');
    remove.className = 'chip-remove';
    remove.textContent = '✕';
    remove.title = 'stop watching this field';
    remove.addEventListener('click', () => onRemove(chip.id));

    element.append(label, badge, remove);
    return element;
}

export function renderChipList(input: ChipListInput): void {
    const { container, chips, counts, onRemove, onClear } = input;

    container.textContent = '';
    container.hidden = chips.length === 0;
    if (chips.length === 0) return;

    for (const chip of chips) container.append(chipElement(chip, counts.get(chip.id) ?? 0, onRemove));

    if (chips.length > 1) {
        const clear = document.createElement('button');
        clear.className = 'chip-clear';
        clear.textContent = 'clear all';
        clear.addEventListener('click', onClear);
        container.append(clear);
    }
}
