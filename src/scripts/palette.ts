import { rankCommands, type Command } from '../lib/fuzzy';

// The command palette: `/` or Ctrl/Cmd-K opens it, typing filters, arrows move, Enter runs,
// Esc closes and focus goes back to whatever opened it.
export interface PaletteOptions {
  root: HTMLElement;
  commands: Command[];
  onRun: (id: string) => void;
  onMove?: () => void;
  doc?: Document;
}

export interface Palette {
  open(opener?: HTMLElement | null): void;
  close(): void;
  isOpen(): boolean;
  setCommands(commands: Command[]): void;
}

const EDITABLE = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';

export function createPalette(opts: PaletteOptions): Palette {
  const { root, onRun, onMove } = opts;
  const doc = opts.doc ?? document;
  let commands = opts.commands;
  const input = root.querySelector<HTMLInputElement>('input')!;
  const list = root.querySelector<HTMLElement>('[role="listbox"]')!;
  const empty = root.querySelector<HTMLElement>('[data-palette-empty]')!;
  let opener: HTMLElement | null = null;
  let shown: Command[] = [];
  let active = 0;

  function render(): void {
    shown = rankCommands(input.value, commands);
    active = Math.min(active, Math.max(0, shown.length - 1));
    list.replaceChildren(
      ...shown.map((c, i) => {
        const li = doc.createElement('li');
        li.id = `palette-item-${i}`;
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', String(i === active));
        li.dataset.id = c.id;
        li.dataset.group = c.group;
        li.className = 'palette__item' + (i === active ? ' is-active' : '');
        const label = doc.createElement('span');
        label.className = 'palette__label';
        label.textContent = c.label;
        li.append(label);
        if (c.hint) {
          const hint = doc.createElement('span');
          hint.className = 'palette__hint meta';
          hint.textContent = c.hint;
          li.append(hint);
        }
        return li;
      }),
    );
    empty.hidden = shown.length > 0;
    input.setAttribute('aria-activedescendant', shown.length ? `palette-item-${active}` : '');
    list.querySelector('.is-active')?.scrollIntoView?.({ block: 'nearest' });
  }

  function move(delta: number): void {
    if (shown.length === 0) return;
    active = (active + delta + shown.length) % shown.length;
    render();
    onMove?.();
  }

  function run(): void {
    const c = shown[active];
    if (!c) return;
    close();
    onRun(c.id);
  }

  function open(from?: HTMLElement | null): void {
    if (!root.hidden) return;
    const fallback = doc.activeElement instanceof HTMLElement ? doc.activeElement : null;
    opener = from ?? fallback;
    input.value = '';
    active = 0;
    root.hidden = false;
    doc.body.classList.add('palette-open');
    render();
    input.focus();
    root.dispatchEvent(new CustomEvent('palette:open'));
  }

  function close(): void {
    if (root.hidden) return;
    root.hidden = true;
    doc.body.classList.remove('palette-open');
    root.dispatchEvent(new CustomEvent('palette:close'));
    const back = opener;
    opener = null;
    if (back && typeof back.focus === 'function') back.focus();
  }

  input.addEventListener('input', () => {
    active = 0;
    render();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      move(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      move(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Tab') {
      // The box is the whole dialog: focus stays on the input while it is open.
      e.preventDefault();
    }
  });
  list.addEventListener('click', (e) => {
    const li = (e.target as Element).closest<HTMLElement>('[role="option"]');
    if (!li) return;
    active = Number(li.id.replace('palette-item-', ''));
    run();
  });
  root.addEventListener('click', (e) => {
    if (e.target === root) close();
  });

  doc.addEventListener('keydown', (e) => {
    if (!root.isConnected) return;
    const target = e.target as HTMLElement | null;
    const typing = !!target?.closest?.(EDITABLE);
    const combo = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k';
    if (combo || (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey)) {
      e.preventDefault();
      if (root.hidden) open(target instanceof HTMLElement ? target : null);
      else close();
    }
  });

  return {
    open,
    close,
    isOpen: () => !root.hidden,
    setCommands(next) {
      commands = next;
      if (!root.hidden) render();
    },
  };
}
