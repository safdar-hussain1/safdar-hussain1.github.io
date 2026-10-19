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
