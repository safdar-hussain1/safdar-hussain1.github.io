// A loop plays only while its card is on screen, and never when the visitor asked for
// reduced motion: the poster stays and nothing moves.
export function watchLoops(root: ParentNode = document): () => void {
  const videos = Array.from(root.querySelectorAll<HTMLVideoElement>('video.loop'));
  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (still || videos.length === 0 || typeof IntersectionObserver === 'undefined') return () => {};
  const io = new IntersectionObserver(
    (records) => {
      for (const r of records) {
        const v = r.target as HTMLVideoElement;
        if (r.isIntersecting) v.play().catch(() => {});
        else v.pause();
      }
    },
    { threshold: 0.35 },
  );
  videos.forEach((v) => io.observe(v));
  return () => io.disconnect();
}
