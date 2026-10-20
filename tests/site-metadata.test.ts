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
    expect(html).toMatch(/built by Safdar Hussain/i);
    expect(html).toContain(`© ${SITE.copyrightYear} Safdar Hussain. All rights reserved.`);
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
    expect(hrefs).toEqual(['#projects', '#experience', '#skills', '#about', '#contact', '/city/']);
    const labels = [...nav.matchAll(/<a [^>]*>([\s\S]*?)<\/a>/g)].map((m) => m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
    expect(labels).toEqual(['Projects', 'Experience', 'Skills', 'About', 'Contact', '3D city']);
  });

  test('the hero has the pitch, the calls to action and the picture of the city', () => {
    expect(html).toMatch(/I build machine learning, computer vision and full products that run on <em class="em"[^>]*>your own device<\/em>, and I publish the numbers behind them\./);
    expect(html).toContain(`${SITE.author.jobTitle} at ${SITE.author.employer}`);
    expect(html).toMatch(/<a class="btn cta" href="#projects"[^>]*>See the projects/);
    // The four facts under the hero: the CGPA is the only figure, and it is the allowed one.
    const stats = html.match(/<ul class="hero__stats"[\s\S]*?<\/ul>/)![0];
    expect(stats).toMatch(/<b[^>]*>9\.19<\/b>/);
    expect(stats).toContain('Technical Head');
    expect(stats).toContain('Six products');
    expect(html).toMatch(/<a class="btn ghost" href="\/city\/"[^>]*>[\s\S]*?Explore the 3D city/);
    expect(html).toContain('id="hero-art"');
    expect(html).toMatch(/<img[^>]*class="hero__still"[^>]*src="\/hero-still-sm\.webp"[^>]*fetchpriority="high"/);
    expect(html).toMatch(/hero__still[^>]*alt="A small night city on a round plinth: 8 buildings along one road, 6 of them with a lit screen on the facade"/);
  });

  test('the switches exist for the theme, sound and palette', () => {
    for (const id of ['theme-switch', 'sound-switch', 'palette-trigger']) expect(html).toContain(`id="${id}"`);
  });
});
