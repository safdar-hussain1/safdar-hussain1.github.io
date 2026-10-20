import { describe, expect, test } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { SITE } from '../src/data/site';

const docs = join(process.cwd(), 'docs');
const LIVE = ['wardos', 'nightingale', 'trafficlens', 'red-light-green-light-cv', 'carmine', 'homecast'];

describe('robots, sitemap, 404 and the preview pictures', () => {
  test('robots lists the site sitemap and every live project sitemap', () => {
    const robots = readFileSync(join(docs, 'robots.txt'), 'utf8');
    expect(robots).toContain('User-agent: *');
    expect(robots).toContain(`Sitemap: ${SITE.url}sitemap.xml`);
    for (const s of [...LIVE, 'health-haven']) expect(robots).toContain(`Sitemap: ${SITE.url}${s}/sitemap.xml`);
  });

  test('sitemap lists the home page and every live project page with lastmod', () => {
    const xml = readFileSync(join(docs, 'sitemap.xml'), 'utf8');
    expect(xml).toContain(`<loc>${SITE.url}</loc>`);
    for (const s of LIVE) expect(xml).toContain(`<loc>${SITE.url}work/${s}/</loc>`);
    expect((xml.match(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/g) ?? []).length).toBe(LIVE.length + 1);
    expect(xml).not.toContain('wavelength');
  });

  test('the 404 page exists and is not indexed', () => {
    const html = readFileSync(join(docs, '404.html'), 'utf8');
    expect(html).toContain('<meta name="robots" content="noindex"');
    expect(html).toContain('<title>Not found — Safdar Hussain</title>');
  });

  test('og-image is 1200x630 under 500 KB', async () => {
    const p = join(docs, 'og-image.png');
    expect(existsSync(p)).toBe(true);
    const m = await sharp(p).metadata();
    expect([m.width, m.height]).toEqual([1200, 630]);
    expect(statSync(p).size).toBeLessThan(500 * 1024);
  });

  test('the hero still exists at 1600x1000 under 240 KB, with an 800x500 version under 80 KB', async () => {
    const big = join(docs, 'hero-still.webp');
    const small = join(docs, 'hero-still-sm.webp');
    expect(existsSync(big)).toBe(true);
    expect(existsSync(small)).toBe(true);
    const m = await sharp(big).metadata();
    expect([m.width, m.height]).toEqual([1600, 1000]);
    expect(statSync(big).size).toBeLessThan(240 * 1024);
    const s = await sharp(small).metadata();
    expect([s.width, s.height]).toEqual([800, 500]);
    expect(statSync(small).size).toBeLessThan(80 * 1024);
  });

  test('each live project page has its own 1200x630 preview', async () => {
    for (const s of LIVE) {
      const p = join(docs, 'work', s, 'og.png');
      expect(existsSync(p), s).toBe(true);
      const m = await sharp(p).metadata();
      expect([m.width, m.height], s).toEqual([1200, 630]);
      expect(statSync(p).size, s).toBeLessThan(500 * 1024);
    }
  });
});
