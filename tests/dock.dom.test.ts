// @vitest-environment happy-dom
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { adaptFrameDocument, createDock, type DockEntry } from '../src/scripts/dock';

const SITE = 'https://safdar-hussain1.github.io/';
const entries: DockEntry[] = [
  { slug: 'wardos', name: 'WardOS', live: 'https://safdar-hussain1.github.io/wardos/', accent: '#0369a1', accentInk: { dark: '#3084b2', light: '#0369a1' } },
  { slug: 'carmine', name: 'Carmine', live: 'https://safdar-hussain1.github.io/carmine/', accent: '#a4133c', accentInk: { dark: '#c15f7a', light: '#a4133c' } },
];

function mount(): { root: HTMLElement; trigger: HTMLElement } {
  document.body.innerHTML = `
    <a id="t" data-dock="wardos" href="https://safdar-hussain1.github.io/wardos/">Use it here</a>
    <div id="dock" hidden>
      <b data-dock-name></b>
      <a data-dock-open href="/">open</a>
      <button data-dock-close>close</button>
      <iframe src="about:blank"></iframe>
      <div data-dock-loading hidden></div>
      <div data-dock-fallback hidden><img data-dock-poster alt="" /></div>
    </div>`;
  return { root: document.getElementById('dock')!, trigger: document.getElementById('t')! };
}

describe('dock', () => {
  beforeEach(() => {
    history.replaceState(null, '', '/');
  });

  test('open frames the entry by its path and sets the hash', async () => {
    const { root, trigger } = mount();
    const dock = createDock({ root, entries, siteUrl: SITE, wide: () => true });
    await dock.open('wardos', trigger);
    expect(root.querySelector('iframe')!.getAttribute('src')).toBe('/wardos/');
    expect(root.hidden).toBe(false);
    expect(location.hash).toBe('#work/wardos');
    expect(root.querySelector('[data-dock-name]')!.textContent).toBe('WardOS');
    expect(dock.current()).toBe('wardos');
  });

  test('close clears the frame and restores focus', async () => {
    const { root, trigger } = mount();
    const dock = createDock({ root, entries, siteUrl: SITE, wide: () => true });
    trigger.focus();
    await dock.open('carmine', trigger);
    await dock.close();
    expect(root.hidden).toBe(true);
    expect(root.querySelector('iframe')!.getAttribute('src')).toBe('about:blank');
    expect(location.hash).toBe('');
    expect(document.activeElement).toBe(trigger);
    expect(dock.current()).toBeNull();
  });

  test('shows the fallback when the frame does not load in time', async () => {
    vi.useFakeTimers();
    const { root } = mount();
    const dock = createDock({ root, entries, siteUrl: SITE, wide: () => true, loadTimeoutMs: 50 });
    await dock.open('wardos');
    expect(root.querySelector<HTMLElement>('[data-dock-loading]')!.hidden).toBe(false);
    vi.advanceTimersByTime(60);
    expect(root.querySelector<HTMLElement>('[data-dock-fallback]')!.hidden).toBe(false);
    expect(root.querySelector<HTMLImageElement>('[data-dock-poster]')!.getAttribute('src')).toBe('/work/wardos/poster.webp');
    vi.useRealTimers();
  });

  test('a dock click on a narrow screen is not intercepted', async () => {
    const { root, trigger } = mount();
    const dock = createDock({ root, entries, siteUrl: SITE, wide: () => false });
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    trigger.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
    expect(dock.current()).toBeNull();
  });

  test('a dock click on a wide screen opens the dock instead of following the link', async () => {
    const { root, trigger } = mount();
    const dock = createDock({ root, entries, siteUrl: SITE, wide: () => true });
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    trigger.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    await Promise.resolve();
    expect(dock.current()).toBe('wardos');
  });

  test('Escape closes the dock', async () => {
    const { root } = mount();
    const dock = createDock({ root, entries, siteUrl: SITE, wide: () => true });
    await dock.open('wardos');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await Promise.resolve();
    expect(dock.current()).toBeNull();
  });

  test('adaptFrame rewrites external links to _top and reports Escape', () => {
    const doc = document.implementation.createHTMLDocument('app');
    doc.body.innerHTML = `
      <a id="gh" href="https://github.com/safdar-hussain1/wardos">Source</a>
      <a id="root" href="https://safdar-hussain1.github.io/">Home</a>
      <a id="in" href="https://safdar-hussain1.github.io/wardos/#bills">Bills</a>
      <a id="hash" href="#measurements">Measurements</a>`;
    const posted: unknown[] = [];
    adaptFrameDocument(doc, SITE, (m) => posted.push(m));
    expect(doc.getElementById('gh')!.getAttribute('target')).toBe('_top');
    expect(doc.getElementById('root')!.getAttribute('target')).toBe('_top');
    expect(doc.getElementById('in')!.getAttribute('target')).toBeNull();
    expect(doc.getElementById('hash')!.getAttribute('target')).toBeNull();
    doc.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(posted).toEqual([{ type: 'portfolio:esc' }]);
  });
});
