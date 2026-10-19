// @vitest-environment happy-dom
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createDock, type DockEntry } from '../src/scripts/dock';
import { adaptFrameDocument, ESCAPE_SETTLE_MS, looksBroken, openCount } from '../src/scripts/frame';

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
      <div data-dock-stage></div>
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
    expect(root.querySelector('iframe')).toBeNull();
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
    expect(root.querySelector('iframe')).not.toBeNull();
    vi.advanceTimersByTime(60);
    expect(root.querySelector<HTMLElement>('[data-dock-fallback]')!.hidden).toBe(false);
    expect(root.querySelector<HTMLImageElement>('[data-dock-poster]')!.getAttribute('src')).toBe('/work/wardos/poster.webp');
    expect(root.querySelector('iframe')).toBeNull();
    vi.useRealTimers();
  });

  test('a modified click is left to the browser', async () => {
    const { root, trigger } = mount();
    const dock = createDock({ root, entries, siteUrl: SITE, wide: () => true });
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true });
    trigger.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
    expect(dock.current()).toBeNull();
  });

  test('a prevented Escape does not close the dock', async () => {
    const { root } = mount();
    const dock = createDock({ root, entries, siteUrl: SITE, wide: () => true });
    await dock.open('wardos');
    const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    ev.preventDefault();
    document.dispatchEvent(ev);
    await Promise.resolve();
    expect(dock.current()).toBe('wardos');
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
    vi.useFakeTimers();
    adaptFrameDocument(doc, SITE, () => posted.push('escape'));
    expect(doc.getElementById('gh')!.getAttribute('target')).toBe('_top');
    expect(doc.getElementById('root')!.getAttribute('target')).toBe('_top');
    expect(doc.getElementById('in')!.getAttribute('target')).toBeNull();
    expect(doc.getElementById('hash')!.getAttribute('target')).toBeNull();
    doc.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    vi.advanceTimersByTime(ESCAPE_SETTLE_MS + 5);
    expect(posted).toEqual(['escape']);
    vi.useRealTimers();
  });

  test('Escape stays with an app that closes something, and reaches the page otherwise', () => {
    vi.useFakeTimers();
    const doc = document.implementation.createHTMLDocument('app');
    doc.body.innerHTML = '<button id="menu" aria-expanded="true">Role</button><details open><summary>Row</summary>Expanded for good</details>';
    const reached: number[] = [];
    adaptFrameDocument(doc, SITE, () => reached.push(1));
    expect(openCount(doc)).toBe(2);
    // The app closes its menu on Escape: the dock stays.
    doc.getElementById('menu')!.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Escape') doc.getElementById('menu')!.setAttribute('aria-expanded', 'false');
    });
    doc.getElementById('menu')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    vi.advanceTimersByTime(ESCAPE_SETTLE_MS + 5);
    expect(reached).toEqual([]);
    // A disclosure that stays open does not count as the app using the key.
    doc.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    vi.advanceTimersByTime(ESCAPE_SETTLE_MS + 5);
    expect(reached).toEqual([1]);
    // A prevented Escape never reaches the page.
    const prevented = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    prevented.preventDefault();
    doc.dispatchEvent(prevented);
    vi.advanceTimersByTime(ESCAPE_SETTLE_MS + 5);
    expect(reached).toEqual([1]);
    vi.useRealTimers();
  });

  test('Tab at the end of the app hands focus back to the page', () => {
    const doc = document.implementation.createHTMLDocument('app');
    doc.body.innerHTML = '<button id="a">A</button><button id="b">B</button>';
    const out: string[] = [];
    adaptFrameDocument(doc, SITE, () => {}, (d) => out.push(d));
    const first = doc.getElementById('a') as HTMLButtonElement;
    const last = doc.getElementById('b') as HTMLButtonElement;
    for (const el of [first, last]) Object.defineProperty(el, 'getClientRects', { value: () => [{}] });
    Object.defineProperty(doc, 'activeElement', { value: last, configurable: true });
    const forward = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
    doc.dispatchEvent(forward);
    expect(out).toEqual(['forward']);
    expect(forward.defaultPrevented).toBe(true);
    Object.defineProperty(doc, 'activeElement', { value: first, configurable: true });
    doc.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true }));
    expect(out).toEqual(['forward', 'backward']);
    Object.defineProperty(doc, 'activeElement', { value: first, configurable: true });
    const middle = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
    doc.dispatchEvent(middle);
    expect(middle.defaultPrevented).toBe(false);
  });

  test('a bare error page is recognised as broken', () => {
    const doc = document.implementation.createHTMLDocument('x');
    doc.title = '';
    doc.body.innerHTML = '404 Not Found';
    expect(looksBroken(doc)).toBe(true);
    const fine = document.implementation.createHTMLDocument('x');
    fine.title = '';
    fine.body.innerHTML = '<h1>Welcome</h1><p>A real page with a long body of text that says nothing about errors at all, and keeps going for a while.</p>';
    expect(looksBroken(fine)).toBe(false);
  });

  test('a GitHub Pages 404 is recognised as broken', () => {
    const doc = document.implementation.createHTMLDocument('x');
    doc.title = 'Site not found · GitHub Pages';
    expect(looksBroken(doc)).toBe(true);
    const ok = document.implementation.createHTMLDocument('x');
    ok.title = 'WardOS';
    expect(looksBroken(ok)).toBe(false);
  });
});
