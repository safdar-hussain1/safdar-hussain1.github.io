// Sections and cards marked data-reveal rise into view once; nothing is hidden where scripts
// do not run (the html.js class is what the styles key on), and nothing moves under reduced motion.
export function watchReveals(root: ParentNode = document): void {
  const items = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'));
  if (items.length === 0) return;
  if (typeof IntersectionObserver === 'undefined' || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    items.forEach((el) => el.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver(
    (records) => {
      for (const r of records) {
        if (!r.isIntersecting) continue;
        const el = r.target as HTMLElement;
        const delay = Number(el.dataset.revealDelay ?? 0);
        if (delay) el.style.transitionDelay = `${delay}ms`;
        el.classList.add('in');
        io.unobserve(el);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
  );
  items.forEach((el) => io.observe(el));
}
