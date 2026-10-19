// A docked project is addressable: #work/<slug>. Anything else is not a dock link.
const WORK_HASH = /^#work\/([a-z0-9-]+)$/;

export function parseWorkHash(hash: string): string | null {
  const m = WORK_HASH.exec(hash);
  return m ? m[1] : null;
}

export function workHash(slug: string): string {
  return `#work/${slug}`;
}
