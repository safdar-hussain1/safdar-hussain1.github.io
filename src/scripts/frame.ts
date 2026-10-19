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
}

export interface MountedFrame {
  frame: HTMLIFrameElement;
  destroy(): void;
}

const BROKEN_TITLE = /\b404\b|not found|isn't a GitHub Pages site/i;

export function escapeShouldReachPage(doc: Document, e: KeyboardEvent): boolean {
  if (e.key !== 'Escape' || e.defaultPrevented) return false;
  // An app with something open of its own gets to close that first.
  return !doc.querySelector('dialog[open], [aria-expanded="true"], [aria-modal="true"]:not([hidden])');
}

export function adaptFrameDocument(doc: Document, siteUrl: string, onEscape: () => void): void {
  for (const a of Array.from(doc.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
    const href = a.getAttribute('href') ?? '';
    if (href.startsWith('#') || href.startsWith('javascript:')) continue;
    const abs = new URL(href, doc.baseURI || siteUrl).href;
    if (isExternalTo(abs, siteUrl) || isSiteRoot(abs, siteUrl)) a.setAttribute('target', '_top');
  }
  doc.addEventListener('keydown', (e) => {
    if (escapeShouldReachPage(doc, e as KeyboardEvent)) onEscape();
  });
}

export function looksBroken(doc: Document | null): boolean {
  if (!doc) return false;
  return BROKEN_TITLE.test(doc.title) || /There isn't a GitHub Pages site here/i.test(doc.body?.textContent ?? '');
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
        adaptFrameDocument(doc, siteUrl, () => opts.onEscape?.());
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
