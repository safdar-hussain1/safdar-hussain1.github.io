import { parseWorkHash, workHash } from '../lib/hash';
import { framePath } from '../lib/url';
import { mountFrame, type MountedFrame } from './frame';

// The dock runs a project's live site inside the page, full size, with the camera and WebGL
// it needs. A fresh frame is mounted on every open and removed on close.
export interface DockEntry {
  slug: string;
  name: string;
  live: string;
  accent: string;
  accentInk: { dark: string; light: string };
}

export interface DockHooks {
  beforeOpen?(slug: string): Promise<void> | void;
  afterClose?(slug: string): Promise<void> | void;
}

export interface DockOptions {
  root: HTMLElement;
  entries: DockEntry[];
  siteUrl: string;
  loadTimeoutMs?: number;
  hooks?: DockHooks;
  wide?: () => boolean;
  doc?: Document;
}

export interface Dock {
  open(slug: string, trigger?: HTMLElement | null): Promise<void>;
  close(): Promise<void>;
  current(): string | null;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, iframe, [tabindex]:not([tabindex="-1"])';

type Loops = { pauseAll(): void; resume(): void };

export function createDock(opts: DockOptions): Dock {
  const { root, entries, siteUrl, hooks = {} } = opts;
  const doc = opts.doc ?? document;
  const loadTimeoutMs = opts.loadTimeoutMs ?? 12_000;
  const wide = opts.wide ?? (() => typeof matchMedia === 'function' && matchMedia('(min-width: 900px)').matches);

  const stage = root.querySelector<HTMLElement>('[data-dock-stage]')!;
  const name = root.querySelector<HTMLElement>('[data-dock-name]')!;
  const openLink = root.querySelector<HTMLAnchorElement>('[data-dock-open]')!;
  const closeBtn = root.querySelector<HTMLButtonElement>('[data-dock-close]')!;
  const loading = root.querySelector<HTMLElement>('[data-dock-loading]')!;
  const fallback = root.querySelector<HTMLElement>('[data-dock-fallback]')!;
  const poster = root.querySelector<HTMLImageElement>('[data-dock-poster]')!;

  let current: string | null = null;
  let trigger: HTMLElement | null = null;
  let mounted: MountedFrame | null = null;

  const loops = () => (globalThis as { __loops?: Loops }).__loops;

  function entry(slug: string): DockEntry | undefined {
    return entries.find((e) => e.slug === slug);
  }

  function setHash(hash: string | null): void {
    try {
      history.replaceState(null, '', hash ?? location.pathname + location.search);
    } catch {
      // Without history (a sandboxed test), the dock still works.
    }
  }

  function showFallback(): void {
    loading.hidden = true;
    fallback.hidden = false;
    mounted?.destroy();
    mounted = null;
  }

  async function open(slug: string, from?: HTMLElement | null): Promise<void> {
    const e = entry(slug);
    if (!e || current === slug) return;
    trigger = from ?? (doc.activeElement as HTMLElement | null);
    await hooks.beforeOpen?.(slug);
    current = slug;
    name.textContent = e.name;
    openLink.href = e.live;
    root.style.setProperty('--accent', e.accent);
    root.style.setProperty('--accent-ink', e.accentInk.dark);
    root.style.setProperty('--accent-ink-light', e.accentInk.light);
    poster.src = `/work/${slug}/poster.webp`;
    poster.alt = `${e.name} as it opens`;
    fallback.hidden = true;
    loading.hidden = false;
    mounted?.destroy();
    mounted = mountFrame({
      stage,
      path: framePath(e.live, siteUrl),
      title: `${e.name}, running in the page`,
      siteUrl,
      timeoutMs: loadTimeoutMs,
      onLoad: () => {
        if (current !== slug) return;
        loading.hidden = true;
        root.dispatchEvent(new CustomEvent('dock:loaded', { detail: slug }));
      },
      onTimeout: () => {
        if (current === slug) showFallback();
      },
      onBroken: () => {
        if (current === slug) showFallback();
      },
      onEscape: () => void close(),
      onTabOut: (direction) => (direction === 'forward' ? openLink : closeBtn).focus(),
    });
    root.hidden = false;
    root.classList.add('open');
    doc.body.classList.add('dock-open');
    loops()?.pauseAll();
    setHash(workHash(slug));
    closeBtn.focus();
    root.dispatchEvent(new CustomEvent('dock:open', { detail: slug }));
  }

  async function close(): Promise<void> {
    if (!current) return;
    const slug = current;
    current = null;
    mounted?.destroy();
    mounted = null;
    root.classList.remove('open');
    root.hidden = true;
    doc.body.classList.remove('dock-open');
    loading.hidden = true;
    fallback.hidden = true;
    setHash(null);
    loops()?.resume();
    root.dispatchEvent(new CustomEvent('dock:close', { detail: slug }));
    await hooks.afterClose?.(slug);
    trigger?.focus();
    trigger = null;
  }

  closeBtn.addEventListener('click', () => void close());

  doc.addEventListener('click', (e) => {
    if (!root.isConnected) return;
    const me = e as MouseEvent;
    // A modified or middle click means "in a new tab": leave it to the browser.
    if (me.metaKey || me.ctrlKey || me.shiftKey || me.altKey || me.button !== 0) return;
    const target = (e.target as Element | null)?.closest?.('[data-dock]') as HTMLElement | null;
    if (!target || !wide()) return;
    e.preventDefault();
    void open(target.dataset.dock!, target);
  });

  doc.addEventListener('keydown', (e) => {
    if (!current || !root.isConnected || e.defaultPrevented) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      void close();
      return;
    }
    if (e.key === 'Tab') {
      const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.hidden && (el.offsetParent !== null || el.tagName === 'IFRAME'));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && doc.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && doc.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  // Whatever path focus takes out of an open dock (a frame's last control in a browser that
  // skips links, a stray click), it comes back to the bar.
  doc.addEventListener('focusin', (e) => {
    if (!current || !root.isConnected) return;
    const target = e.target as Element | null;
    if (target && !root.contains(target)) openLink.focus();
  });
  // Some browsers drop focus on the page body when it leaves the frame; after that Tab,
  // carry it on in the direction it was going.
  doc.addEventListener('keyup', (e) => {
    if (!current || !root.isConnected || e.key !== 'Tab' || doc.activeElement !== doc.body) return;
    if (e.shiftKey) closeBtn.focus();
    else (mounted?.frame ?? openLink).focus();
  });

  const fromHash = typeof location !== 'undefined' ? parseWorkHash(location.hash) : null;
  if (fromHash && entry(fromHash) && wide()) void open(fromHash, null);

  return { open, close, current: () => current };
}
