import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { SITE } from '../data/site';
import { liveEntries } from '../lib/work';

// Crawlers read robots.txt only at the host root, so this is the one place every project's
// sitemap can be announced; the project sites themselves carry none.
export const GET: APIRoute = async () => {
  const entries = liveEntries((await getCollection('work')).map((e) => e.data));
  const lines = [
    'User-agent: *',
    'Allow: /',
    '',
    `Sitemap: ${SITE.url}sitemap.xml`,
    ...entries.map((e) => `Sitemap: ${SITE.url}${e.slug}/sitemap.xml`),
    `Sitemap: ${SITE.url}health-haven/sitemap.xml`,
    '',
  ];
  return new Response(lines.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
