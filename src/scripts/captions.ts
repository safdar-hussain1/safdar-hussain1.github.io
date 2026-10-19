// On the flat site every card is visible. When the 3D city runs, the same cards become the
// captions beside the buildings: only the active one shows, and the rail marks the stop.
export interface Captions {
  setActive(i: number): void;
  clear(): void;
  active(): number;
}

export function createCaptions(root: HTMLElement = document.body): Captions {
  const plates = Array.from(root.querySelectorAll<HTMLElement>('.plate[data-status="live"]'));
  const ticks = Array.from(root.querySelectorAll<HTMLElement>('.rail button'));
  let current = -1;
  return {
    setActive(i) {
      if (i === current) return;
      current = i;
      plates.forEach((el, k) => el.classList.toggle('on', k === i));
      ticks.forEach((el, k) => {
        el.classList.toggle('on', k === i);
        el.setAttribute('aria-current', k === i ? 'true' : 'false');
      });
      const accent = plates[i]?.dataset.accent;
      const ink = plates[i]?.dataset.accentInk;
      if (accent) document.documentElement.style.setProperty('--accent', accent);
      if (ink) document.documentElement.style.setProperty('--accent-ink', ink);
    },
    clear() {
      current = -1;
      plates.forEach((el) => el.classList.remove('on'));
      ticks.forEach((el) => {
        el.classList.remove('on');
        el.setAttribute('aria-current', 'false');
      });
      document.documentElement.style.removeProperty('--accent');
      document.documentElement.style.removeProperty('--accent-ink');
    },
    active: () => current,
  };
}
