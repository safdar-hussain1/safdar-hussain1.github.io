// A card shows a still of its project until it is near the viewport; then the eight-second
// loop of the real page is added and plays while the card is on screen. Nothing moves under
// reduced motion or Save-Data, and every loop pauses while a project is docked.
type Loops = { pauseAll(): void; resume(): void };

function wantsStills(): boolean {
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const saveData = Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData);
  return reduce || saveData;
}

export function watchLoops(root: ParentNode = document): Loops {
  const media = Array.from(root.querySelectorAll<HTMLElement>('[data-loop-webm]'));
  const inView = new Set<HTMLVideoElement>();
  let paused = false;
  const api: Loops = {
    pauseAll() {
      paused = true;
      root.querySelectorAll<HTMLVideoElement>('video.loop').forEach((v) => v.pause());
    },
    resume() {
      paused = false;
      inView.forEach((v) => v.play().catch(() => {}));
    },
  };
  (globalThis as { __loops?: Loops }).__loops = api;
  if (wantsStills() || media.length === 0 || typeof IntersectionObserver === 'undefined') return api;

  function videoFor(box: HTMLElement): HTMLVideoElement {
    let v = box.querySelector<HTMLVideoElement>('video.loop');
    if (v) return v;
    v = document.createElement('video');
    v.className = 'loop';
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.preload = 'none';
    v.setAttribute('aria-hidden', 'true');
    v.tabIndex = -1;
    for (const [src, type] of [
      [box.dataset.loopWebm, 'video/webm'],
      [box.dataset.loopMp4, 'video/mp4'],
    ] as const) {
      if (!src) continue;
      const s = document.createElement('source');
      s.src = src;
      s.type = type;
      v.append(s);
    }
    v.addEventListener('playing', () => box.classList.add('is-playing'), { once: true });
    box.append(v);
    return v;
  }

  const near = new IntersectionObserver(
    (records) => {
      for (const r of records) {
        if (!r.isIntersecting) continue;
        videoFor(r.target as HTMLElement);
        near.unobserve(r.target);
      }
    },
    { rootMargin: '240px 0px' },
  );
  const visible = new IntersectionObserver(
    (records) => {
      for (const r of records) {
        const box = r.target as HTMLElement;
        const v = box.querySelector<HTMLVideoElement>('video.loop');
        if (!v) continue;
        if (r.isIntersecting) {
          inView.add(v);
          if (!paused) v.play().catch(() => {});
        } else {
          inView.delete(v);
          v.pause();
        }
      }
    },
    { threshold: 0.35 },
  );
  media.forEach((box) => {
    near.observe(box);
    visible.observe(box);
  });
  return api;
}
