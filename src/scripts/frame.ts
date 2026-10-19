import { isExternalTo, isSiteRoot } from '../lib/url';

// A project's live site inside this page. The frame is created when it is wanted and removed
// when it is not, so opening and closing never adds history entries. Because the frame is
// same-origin, the page adapts the site from outside: links that would leave the frame open in
// the top window, Esc inside the app reaches the page, and a 404 is recognised.
export interface FrameOptions {
  stage: HTMLElement;
  path: string;
  title: string;
  siteUrl: string;
  timeoutMs?: number;
  onLoad?(frame: HTMLIFrameElement): void;
  onTimeout?(): void;
  onBroken?(): void;
  onEscape?(): void;
  onTabOut?(direction: 'forward' | 'backward'): void;
}

export interface MountedFrame {
  frame: HTMLIFrameElement;
  destroy(): void;
}

const BROKEN_TITLE = /\b404\b|not found|isn't a GitHub Pages site/i;
const ERROR_BODY = /^\s*(?:(?:404|500|502|503)\b|not found|internal server error|file not found)/i;
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// How many things the app has open: dialogs, menus, expanded controls. If Escape makes that
// number drop, the app used the key and the page leaves the dock alone.
export function openCount(doc: Document): number {
  return doc.querySelectorAll('dialog[open], [open], [aria-expanded="true"], [aria-modal="true"]:not([hidden])').length;
}

export const ESCAPE_SETTLE_MS = 80;

export function adaptFrameDocument(doc: Document, siteUrl: string, onEscape: () => void, onTabOut?: (direction: 'forward' | 'backward') => void): void {
  for (const a of Array.from(doc.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
    const href = a.getAttribute('href') ?? '';
    if (href.startsWith('#') || href.startsWith('javascript:')) continue;
    const abs = new URL(href, doc.baseURI || siteUrl).href;
    if (isExternalTo(abs, siteUrl) || isSiteRoot(abs, siteUrl)) a.setAttribute('target', '_top');
  }
  // Counted in the capture phase, before the app's own handlers run, so a menu the app closes
  // on Escape is seen as closed afterwards and the dock stays open.
  doc.addEventListener(
    'keydown',
    (e) => {
      const key = e as KeyboardEvent;
      if (key.key !== 'Escape') return;
      const before = openCount(doc);
      setTimeout(() => {
        if (key.defaultPrevented || openCount(doc) < before) return;
        onEscape();
      }, ESCAPE_SETTLE_MS);
    },
    { capture: true },
  );
  doc.addEventListener('keydown', (e) => {
    const key = e as KeyboardEvent;
    if (key.key !== 'Tab' || key.defaultPrevented || !onTabOut) return;
    // Tab at either end of the app hands focus back to the page's own controls instead of
    // leaving for whatever sits behind the dock.
    const items = Array.from(doc.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.hidden && el.getClientRects().length > 0);
    if (items.length === 0) return;
    const active = doc.activeElement;
    if (!key.shiftKey && (active === items[items.length - 1] || active === doc.body)) {
      key.preventDefault();
      onTabOut('forward');
    } else if (key.shiftKey && (active === items[0] || active === doc.body)) {
      key.preventDefault();
      onTabOut('backward');
    }
  });
}

export function looksBroken(doc: Document | null): boolean {
  if (!doc) return false;
  if (BROKEN_TITLE.test(doc.title) || /There isn't a GitHub Pages site here/i.test(doc.body?.textContent ?? '')) return true;
  // A bare error page: no title, next to nothing in the body, and an error line first.
  const text = (doc.body?.textContent ?? '').trim();
  return doc.title.trim() === '' && text.length < 200 && ERROR_BODY.test(text);
}

export function mountFrame(opts: FrameOptions): MountedFrame {
  const { stage, path, title, siteUrl } = opts;
  const timeoutMs = opts.timeoutMs ?? 12_000;
  const frame = stage.ownerDocument.createElement('iframe');
  frame.className = 'live-frame';
  frame.title = title;
  frame.setAttribute('allow', 'camera; microphone; fullscreen; autoplay');
  frame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
  let timer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
    timer = null;
    opts.onTimeout?.();
  }, timeoutMs);
  let alive = true;
  frame.addEventListener('load', () => {
    if (!alive) return;
    if (timer) clearTimeout(timer);
    timer = null;
    let doc: Document | null = null;
    try {
      doc = frame.contentDocument;
    } catch {
      doc = null;
    }
    if (looksBroken(doc)) {
      opts.onBroken?.();
      return;
    }
    if (doc) {
      try {
        adaptFrameDocument(doc, siteUrl, () => opts.onEscape?.(), opts.onTabOut ? (d) => opts.onTabOut?.(d) : undefined);
      } catch {
        // A document from another origin cannot be adapted; the page's own controls still work.
      }
    }
    opts.onLoad?.(frame);
  });
  frame.src = path;
  stage.append(frame);
  return {
    frame,
    destroy() {
      alive = false;
      if (timer) clearTimeout(timer);
      timer = null;
      frame.remove();
    },
  };
}
