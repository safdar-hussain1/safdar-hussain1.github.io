// @vitest-environment happy-dom
import { beforeEach, describe, expect, test } from 'vitest';
import { createPalette } from '../src/scripts/palette';
import type { Command } from '../src/lib/fuzzy';

const commands: Command[] = [
  { id: 'dock:wardos', label: 'Use WardOS here', group: 'project' },
  { id: 'go:#about', label: 'About', group: 'section' },
  { id: 'theme', label: 'Switch theme', group: 'action' },
];

function mount() {
  document.body.innerHTML = `
    <button id="trigger">open</button>
    <div id="palette" hidden><div role="dialog"><input id="palette-input" /><ul role="listbox"></ul><p data-palette-empty data-text="Nothing matches"></p></div></div>`;
  return { root: document.getElementById('palette')!, trigger: document.getElementById('trigger')! };
}

describe('palette', () => {
  beforeEach(() => mount());

  test('slash opens, Escape closes and focus returns to the trigger', () => {
    const { root, trigger } = mount();
    const ran: string[] = [];
    const palette = createPalette({ root, commands, onRun: (id) => ran.push(id) });
    trigger.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }));
    expect(palette.isOpen()).toBe(true);
    expect(document.activeElement?.id).toBe('palette-input');
    expect(root.querySelectorAll('[role="option"]')).toHaveLength(3);
    root.querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(palette.isOpen()).toBe(false);
    expect(document.activeElement).toBe(trigger);
    expect(ran).toEqual([]);
  });

  test('typing filters, Enter runs the highlighted command', () => {
    const { root } = mount();
    const ran: string[] = [];
    const palette = createPalette({ root, commands, onRun: (id) => ran.push(id) });
    palette.open();
    const input = root.querySelector('input')!;
    input.value = 'ward';
    input.dispatchEvent(new Event('input'));
    expect(root.querySelectorAll('[role="option"]')).toHaveLength(1);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(ran).toEqual(['dock:wardos']);
    expect(palette.isOpen()).toBe(false);
  });

  test('no match shows the empty note and Enter does nothing', () => {
    const { root } = mount();
    const ran: string[] = [];
    const palette = createPalette({ root, commands, onRun: (id) => ran.push(id) });
    palette.open();
    const input = root.querySelector('input')!;
    input.value = 'zzzz';
    input.dispatchEvent(new Event('input'));
    expect(root.querySelector<HTMLElement>('[data-palette-empty]')!.textContent).toBe('Nothing matches');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(ran).toEqual([]);
    expect(palette.isOpen()).toBe(true);
  });

  test('slash inside a text field does not open it', () => {
    const { root } = mount();
    document.body.insertAdjacentHTML('beforeend', '<input id="other" />');
    const other = document.getElementById('other')!;
    const palette = createPalette({ root, commands, onRun: () => {} });
    other.focus();
    other.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }));
    expect(palette.isOpen()).toBe(false);
  });
});
