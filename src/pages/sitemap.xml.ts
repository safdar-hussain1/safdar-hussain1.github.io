import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { SITE } from '../data/site';
import { liveEntries } from '../lib/work';
import lastmod from '../data/lastmod.json';

// Dates are literal so the build stays byte-reproducible.
export const GET: APIRoute = async () => {
  const entries = liveEntries((await getCollection('work')).map((e) => e.data));
  const pages = ['/', '/city/', ...entries.map((e) => `/work/${e.slug}/`)];
  const dates = lastmod as Record<string, string>;
  const body = pages
    .map((p) => `  <url>\n    <loc>${SITE.url}${p.replace(/^\//, '')}</loc>\n    <lastmod>${dates[p] ?? dates['/']}</lastmod>\n  </url>`)
    .join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
