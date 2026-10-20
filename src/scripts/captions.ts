import { currentTheme } from './theme';

// On the flat site every card is visible. When the 3D city runs, the same cards become the
// captions beside the buildings: only the active one shows, the rail marks the stop, and the
// page's accent follows the project in focus. Captions are found by slug, never by position.
export interface Captions {
  setActive(slug: string): void;
  clear(): void;
  active(): string | null;
  /** Re-reads the theme and repaints the accent (the tint per theme differs). */
  refresh(): void;
  /** Called when the keyboard lands inside a caption that is not the active one. */
  onFocus(cb: (slug: string) => void): void;
}

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function createCaptions(root: HTMLElement = document.body, theme: () => 'dark' | 'light' = () => currentTheme()): Captions {
  const doc = root.ownerDocument;
  const plates = Array.from(root.querySelectorAll<HTMLElement>('.plate[data-status="live"]'));
  const ticks = Array.from(root.querySelectorAll<HTMLElement>('.rail button'));
  let current: string | null = null;
  let focusCb: ((slug: string) => void) | null = null;
  const plateFor = (slug: string | null) => plates.find((p) => p.dataset.slug === slug) ?? null;

  function paintAccent(): void {
    const el = plateFor(current);
    const html = doc.documentElement;
    if (!el) {
      html.style.removeProperty('--accent');
      html.style.removeProperty('--accent-ink');
      return;
    }
    const ink = theme() === 'light' ? el.dataset.accentInkLight : el.dataset.accentInk;
    if (el.dataset.accent) html.style.setProperty('--accent', el.dataset.accent);
    if (ink) html.style.setProperty('--accent-ink', ink);
  }

  root.addEventListener('focusin', (e) => {
    const plate = (e.target as Element | null)?.closest?.('.plate[data-status="live"]') as HTMLElement | null;
    if (plate && plate.dataset.slug && plate.dataset.slug !== current) focusCb?.(plate.dataset.slug);
  });

  return {
    setActive(slug) {
      if (slug === current) return;
      const prev = plateFor(current);
      const next = plateFor(slug);
      if (!next) return;
      // The keyboard stays where it was: the same control in the caption that replaces this one.
      const focused = prev && doc.activeElement && prev.contains(doc.activeElement) ? Array.from(prev.querySelectorAll(FOCUSABLE)).indexOf(doc.activeElement) : -1;
      current = slug;
      plates.forEach((el) => el.classList.toggle('on', el === next));
      ticks.forEach((el, k) => {
        const on = plates[k] === next;
        el.classList.toggle('on', on);
        el.setAttribute('aria-current', on ? 'true' : 'false');
      });
      paintAccent();
      if (focused >= 0) {
        const list = next.querySelectorAll<HTMLElement>(FOCUSABLE);
        list[Math.min(focused, list.length - 1)]?.focus({ preventScroll: true });
      }
    },
    clear() {
      current = null;
      plates.forEach((el) => el.classList.remove('on'));
      ticks.forEach((el) => {
        el.classList.remove('on');
        el.setAttribute('aria-current', 'false');
      });
      paintAccent();
    },
    active: () => current,
    refresh: paintAccent,
    onFocus(cb) {
      focusCb = cb;
    },
  };
}
