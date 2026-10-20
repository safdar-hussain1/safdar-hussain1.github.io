// The site is dark; the switch turns it light, and the choice is remembered per browser.
// Storage can be missing or throw (private windows), so every access is guarded.
export const THEME_KEY = 'portfolio.theme';

export type Theme = 'dark' | 'light';

type Store = Pick<Storage, 'getItem' | 'setItem'>;

function storage(): Store | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function readTheme(store: Store | null = storage()): Theme | null {
  try {
    const value = store?.getItem(THEME_KEY);
    return value === 'dark' || value === 'light' ? value : null;
  } catch {
    return null;
  }
}

export function writeTheme(theme: Theme, store: Store | null = storage()): void {
  try {
    store?.setItem(THEME_KEY, theme);
  } catch {
    // The choice still applies for this page; it is just not remembered.
  }
}

export function applyTheme(theme: Theme | null, root: HTMLElement = document.documentElement): void {
  if (theme) root.dataset.theme = theme;
  else delete root.dataset.theme;
}

/** Light only when the visitor chose it; everything else is the dark design. */
export function currentTheme(root: HTMLElement = document.documentElement): Theme {
  return root.dataset.theme === 'light' ? 'light' : 'dark';
}

export function toggleTheme(root: HTMLElement = document.documentElement, store: Store | null = storage()): Theme {
  const next: Theme = currentTheme(root) === 'dark' ? 'light' : 'dark';
  applyTheme(next, root);
  writeTheme(next, store);
  return next;
}
