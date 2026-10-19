// Links inside a docked project decide where they open: another origin or the site root
// must leave the frame, everything else stays inside the app.
export function isExternalTo(href: string, origin: string): boolean {
  try {
    return new URL(href, origin).origin !== new URL(origin).origin;
  } catch {
    return false;
  }
}

export function isSiteRoot(href: string, siteUrl: string): boolean {
  try {
    const u = new URL(href, siteUrl);
    const site = new URL(siteUrl);
    return u.origin === site.origin && (u.pathname === '/' || u.pathname === '');
  } catch {
    return false;
  }
}

// The URL to load into a frame: a project on the site's own host is framed by path, so the
// same page works on github.io and on the local replica that mounts the projects by path.
export function framePath(live: string, siteUrl: string): string {
  try {
    const u = new URL(live);
    if (u.origin !== new URL(siteUrl).origin) return live;
    const path = '/' + u.pathname.replace(/^\/+/, '');
    return `${path}${u.search}${u.hash}`;
  } catch {
    return live;
  }
}
