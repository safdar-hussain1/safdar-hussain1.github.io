import { parseWorkHash, workHash } from '../lib/hash';
import { isExternalTo, isSiteRoot } from '../lib/url';

// The dock runs a project's live site inside the page, in a same-origin frame, with the
// camera and WebGL it needs. It adapts the framed site from the outside: links that would
// leave the frame are sent to the top window, and Esc inside the app closes the dock.
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

export const ESC_MESSAGE = 'portfolio:esc';

export function adaptFrameDocument(doc: Document, siteUrl: string, post: (message: unknown) => void): void {
  for (const a of Array.from(doc.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
    const href = a.getAttribute('href') ?? '';
    if (href.startsWith('#') || href.startsWith('javascript:')) continue;
    const abs = new URL(href, doc.baseURI || siteUrl).href;
    if (isExternalTo(abs, siteUrl) || isSiteRoot(abs, siteUrl)) a.setAttribute('target', '_top');
  }
  doc.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Escape') post({ type: ESC_MESSAGE });
  });
}

export function adaptFrame(frame: HTMLIFrameElement, siteUrl: string): void {
  try {
    const doc = frame.contentDocument;
    if (!doc) return;
    adaptFrameDocument(doc, siteUrl, (m) => window.postMessage(m, '*'));
  } catch {
    // A frame from another origin (a dev server without the replica) cannot be adapted;
    // the bar's own button still closes the dock.
  }
}

const FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function createDock(opts: DockOptions): Dock {
  const { root, entries, siteUrl, hooks = {} } = opts;
  const doc = opts.doc ?? document;
  const loadTimeoutMs = opts.loadTimeoutMs ?? 12_000;
  const wide = opts.wide ?? (() => typeof matchMedia === 'function' && matchMedia('(min-width: 900px)').matches);

  const frame = root.querySelector<HTMLIFrameElement>('iframe')!;
  const name = root.querySelector<HTMLElement>('[data-dock-name]')!;
  const openLink = root.querySelector<HTMLAnchorElement>('[data-dock-open]')!;
  const closeBtn = root.querySelector<HTMLButtonElement>('[data-dock-close]')!;
  const loading = root.querySelector<HTMLElement>('[data-dock-loading]')!;
  const fallback = root.querySelector<HTMLElement>('[data-dock-fallback]')!;
  const poster = root.querySelector<HTMLImageElement>('[data-dock-poster]')!;

  let current: string | null = null;
  let trigger: HTMLElement | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function entry(slug: string): DockEntry | undefined {
    return entries.find((e) => e.slug === slug);
  }

  function setHash(hash: string | null): void {
    try {
      const url = hash ? hash : location.pathname + location.search;
      history.replaceState(null, '', url);
    } catch {
      // Without history (a sandboxed test), the dock still works.
    }
  }

  function clearTimer(): void {
    if (timer) clearTimeout(timer);
    timer = null;
  }

  function onLoad(): void {
    if (!current) return;
    clearTimer();
    loading.hidden = true;
    fallback.hidden = true;
    adaptFrame(frame, siteUrl);
    root.dispatchEvent(new CustomEvent('dock:loaded', { detail: current }));
  }

  frame.addEventListener('load', () => {
    if (frame.getAttribute('src') && frame.getAttribute('src') !== 'about:blank') onLoad();
  });

  async function open(slug: string, from?: HTMLElement | null): Promise<void> {
    const e = entry(slug);
    if (!e) return;
    if (current === slug) return;
    trigger = from ?? (doc.activeElement as HTMLElement | null);
    await hooks.beforeOpen?.(slug);
    current = slug;
    name.textContent = e.name;
    openLink.href = e.live;
    root.style.setProperty('--accent', e.accent);
    root.style.setProperty('--accent-ink', e.accentInk.dark);
    root.style.setProperty('--accent-ink-light', e.accentInk.light);
    poster.src = `/work/${slug}/poster.webp`;
    poster.alt = `${e.name} preview`;
    fallback.hidden = true;
    loading.hidden = false;
    frame.title = `${e.name}, running in the page`;
    frame.src = e.live;
    root.hidden = false;
    root.classList.add('open');
    doc.body.classList.add('dock-open');
    setHash(workHash(slug));
    clearTimer();
    timer = setTimeout(() => {
      if (current !== slug) return;
      loading.hidden = true;
      fallback.hidden = false;
    }, loadTimeoutMs);
    closeBtn.focus();
    root.dispatchEvent(new CustomEvent('dock:open', { detail: slug }));
  }

  async function close(): Promise<void> {
    if (!current) return;
    const slug = current;
    current = null;
    clearTimer();
    root.classList.remove('open');
    root.hidden = true;
    doc.body.classList.remove('dock-open');
    frame.src = 'about:blank';
    frame.title = '';
    loading.hidden = true;
    fallback.hidden = true;
    setHash(null);
    root.dispatchEvent(new CustomEvent('dock:close', { detail: slug }));
    await hooks.afterClose?.(slug);
    trigger?.focus();
    trigger = null;
  }

  closeBtn.addEventListener('click', () => void close());

  doc.addEventListener('click', (e) => {
    if (!root.isConnected) return;
    const target = (e.target as Element | null)?.closest?.('[data-dock]') as HTMLElement | null;
    if (!target) return;
    if (!wide()) return;
    e.preventDefault();
    void open(target.dataset.dock!, target);
  });

  doc.addEventListener('keydown', (e) => {
    if (!current || !root.isConnected) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      void close();
      return;
    }
    if (e.key === 'Tab') {
      const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.hidden && el.offsetParent !== null || el === frame);
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

  if (typeof window !== 'undefined') {
    window.addEventListener('message', (e) => {
      if (current && e.data && (e.data as { type?: string }).type === ESC_MESSAGE) void close();
    });
  }

  const fromHash = typeof location !== 'undefined' ? parseWorkHash(location.hash) : null;
  if (fromHash && entry(fromHash) && wide()) void open(fromHash, null);

  return { open, close, current: () => current };
}
