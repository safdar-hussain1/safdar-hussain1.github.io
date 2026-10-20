// @vitest-environment happy-dom
import { describe, expect, test } from 'vitest';
import { applyTheme, currentTheme, readTheme, toggleTheme } from '../src/scripts/theme';

const throwing = {
  getItem() {
    throw new Error('blocked');
  },
  setItem() {
    throw new Error('blocked');
  },
};

describe('theme', () => {
  test('theme falls back when storage throws', () => {
    const root = document.createElement('html');
    expect(readTheme(throwing)).toBeNull();
    applyTheme(null, root);
    const first = toggleTheme(root, throwing);
    expect(root.dataset.theme).toBe(first);
    const second = toggleTheme(root, throwing);
    expect(second).not.toBe(first);
    expect(root.dataset.theme).toBe(second);
  });

  test('dark unless the visitor chose light, and the choice is remembered', () => {
    const root = document.createElement('html');
    const store = new Map<string, string>();
    const memory = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    expect(currentTheme(root)).toBe('dark');
    applyTheme('light', root);
    expect(currentTheme(root)).toBe('light');
    toggleTheme(root, memory);
    expect(store.get('portfolio.theme')).toBe('dark');
    expect(readTheme(memory)).toBe('dark');
    expect(currentTheme(root)).toBe('dark');
  });
});
