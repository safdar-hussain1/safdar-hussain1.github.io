import { describe, expect, test } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { SITE } from '../src/data/site';
import { count, DOCS, jsonLd, meta, readDoc, shippedScripts } from './helpers/html';

const html = readDoc();

describe('home page head', () => {
  test('title is the site title and at most 60 characters', () => {
    expect(html).toContain(`<title>${SITE.title}</title>`);
    expect(SITE.title.length).toBeLessThanOrEqual(60);
  });

  test('description is 120 to 160 characters and matches og and twitter', () => {
    expect(SITE.description.length).toBeGreaterThanOrEqual(120);
    expect(SITE.description.length).toBeLessThanOrEqual(160);
    expect(meta(html, 'description')).toBe(SITE.description);
    expect(meta(html, 'og:description')).toBe(SITE.description);
    expect(meta(html, 'twitter:description')).toBe(SITE.description);
  });

  test('canonical, author, search console tag, og image 1200x630, twitter card', () => {
    expect(html).toContain(`<link rel="canonical" href="${SITE.url}"`);
    expect(meta(html, 'author')).toBe('Safdar Hussain');
    expect(meta(html, 'google-site-verification')).toBe(SITE.gsc);
    expect(meta(html, 'og:url')).toBe(SITE.url);
    expect(meta(html, 'og:image')).toBe(SITE.ogImage);
    expect(meta(html, 'og:image:width')).toBe('1200');
    expect(meta(html, 'og:image:height')).toBe('630');
    expect(meta(html, 'og:image:alt')).toBeTruthy();
    expect(meta(html, 'twitter:card')).toBe('summary_large_image');
    expect(meta(html, 'twitter:image')).toBe(SITE.ogImage);
  });

  test('json-ld has WebSite and Person with sameAs GitHub and LinkedIn', () => {
    const graph = jsonLd(html)['@graph'] as Array<Record<string, unknown>>;
    const types = graph.map((n) => n['@type']);
    expect(types).toContain('WebSite');
    expect(types).toContain('Person');
    const person = graph.find((n) => n['@type'] === 'Person')!;
    expect(person.sameAs).toEqual([SITE.author.github, SITE.author.linkedin]);
    expect(person.name).toBe('Safdar Hussain');
    const site = graph.find((n) => n['@type'] === 'WebSite')!;
    expect(site.url).toBe(SITE.url);
    expect(site.author).toBeTruthy();
  });

  test('exactly one h1', () => {
    expect(count(html, /<h1[\s>]/g)).toBe(1);
  });
});

describe('authorship marks', () => {
  test('meta author, HTML comment, footer credit', () => {
    expect(html).toContain('<!-- Built by Safdar Hussain · https://github.com/safdar-hussain1 -->');
    expect(html).toMatch(/Built by Safdar Hussain\./);
  });

  test('console signature is in a shipped script', () => {
    const shipped = shippedScripts() + html;
    expect(shipped).toContain('Safdar Hussain · https://github.com/safdar-hussain1');
  });

  test('favicon resolves', () => {
    expect(html).toContain('<link rel="icon" href="/favicon.svg" type="image/svg+xml"');
    expect(existsSync(join(DOCS, 'favicon.svg'))).toBe(true);
  });

  test('the pages root carries .nojekyll', () => {
    expect(existsSync(join(DOCS, '.nojekyll'))).toBe(true);
  });
});

describe('masthead and hero', () => {
  test('the masthead links every section in order', () => {
    const nav = html.match(/<nav class="mast__nav"[^>]*>([\s\S]*?)<\/nav>/)![1];
    const hrefs = [...nav.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs).toEqual(['#work', '#how', '#measured', '#about', '#contact', SITE.author.github]);
  });

  test('the hero line and cue are present', () => {
    expect(html).toContain('I build products that run on your own device and publish the numbers behind them.');
    expect(html).toContain('Every project runs live. Scroll.');
    expect(html).toContain('id="hero-art"');
  });

  test('the switches exist for the theme, sound and palette', () => {
    for (const id of ['theme-switch', 'sound-switch', 'palette-trigger']) expect(html).toContain(`id="${id}"`);
  });
});
