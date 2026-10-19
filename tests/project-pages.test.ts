import { describe, expect, test } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { workSchema, type WorkEntry } from '../src/lib/work-schema';
import { liveEntries } from '../src/lib/work';
import { describePage, pageTitle } from '../src/lib/describe';
import { count, jsonLd, meta } from './helpers/html';

const dir = join(process.cwd(), 'src/content/work');
const entries: WorkEntry[] = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => workSchema.parse(JSON.parse(readFileSync(join(dir, f), 'utf8'))));

describe('project pages', () => {
  test('a page exists for every live entry and none for scenery', () => {
    for (const e of entries) {
      expect(existsSync(join(process.cwd(), 'docs/work', e.slug, 'index.html')), e.slug).toBe(e.status === 'live');
    }
  });

  for (const e of liveEntries(entries)) {
    const html = readFileSync(join(process.cwd(), 'docs/work', e.slug, 'index.html'), 'utf8');

    test(`${e.name}: its own canonical, a title under 60 and a description of 120 to 160`, () => {
      expect(pageTitle(e).length).toBeLessThanOrEqual(60);
      expect(describePage(e).length).toBeGreaterThanOrEqual(120);
      expect(describePage(e).length).toBeLessThanOrEqual(160);
      expect(html).toContain(`<title>${pageTitle(e)}</title>`);
      expect(meta(html, 'description')).toBe(describePage(e));
      expect(html).toContain(`<link rel="canonical" href="https://safdar-hussain1.github.io/work/${e.slug}/"`);
      expect(meta(html, 'og:image')).toBe(`https://safdar-hussain1.github.io/work/${e.slug}/og.png`);
      const graph = jsonLd(html)['@graph'] as Array<Record<string, unknown>>;
      expect(graph.map((n) => n['@type'])).toEqual(['WebSite', 'Person', 'WebPage']);
    });

    test(`${e.name}: lists every fact with its source link and has one h1`, () => {
      const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      for (const f of e.facts) expect(html).toMatch(new RegExp(`<a href="${esc(f.source)}"[^>]*>${esc(f.text)}</a>`));
      expect(count(html, /<h1[\s>]/g)).toBe(1);
      expect(html).toContain(`data-live="${e.live}"`);
      expect(html).toMatch(new RegExp(`<a class="btn app__btn" href="${esc(e.live)}" target="_blank" rel="noopener"[^>]*>Open in its own tab`));
    });
  }
});
