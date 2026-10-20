// Marks the masthead link of the section on screen, so the visitor always knows where they are.
export function watchSections(links: Iterable<HTMLAnchorElement>): void {
  const list = Array.from(links);
  if (list.length === 0 || typeof IntersectionObserver === 'undefined') return;
  const byId = new Map(list.map((a) => [a.dataset.section ?? '', a]));
  const sections = Array.from(byId.keys())
    .map((id) => document.getElementById(id))
    .filter((el): el is HTMLElement => el !== null);
  if (sections.length === 0) return;
  const visible = new Map<string, number>();
  const paint = () => {
    let best = '';
    let most = 0;
    for (const [id, ratio] of visible) {
      if (ratio > most) {
        most = ratio;
        best = id;
      }
    }
    for (const [id, a] of byId) {
      const on = id === best && most > 0;
      a.classList.toggle('is-active', on);
      if (on) a.setAttribute('aria-current', 'location');
      else a.removeAttribute('aria-current');
    }
  };
  const io = new IntersectionObserver(
    (records) => {
      for (const r of records) visible.set((r.target as HTMLElement).id, r.isIntersecting ? r.intersectionRatio : 0);
      paint();
    },
    { rootMargin: '-35% 0px -45% 0px', threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] },
  );
  sections.forEach((s) => io.observe(s));
}
