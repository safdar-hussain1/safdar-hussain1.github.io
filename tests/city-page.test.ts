import { describe, expect, test } from 'vitest';
import { SITE } from '../src/data/site';
import { count, jsonLd, meta, readDoc } from './helpers/html';

// The city page: the 3D stage's home, with every project's card standing in where it cannot run.
const html = readDoc('docs/city/index.html');

describe('the city page', () => {
  test('has its own title, description, canonical and preview, and is indexed', () => {
    expect(html).toContain('<title>The city — Safdar Hussain</title>');
    const d = meta(html, 'description')!;
    expect(d.length).toBeGreaterThanOrEqual(120);
    expect(d.length).toBeLessThanOrEqual(160);
    expect(html).toContain(`<link rel="canonical" href="${SITE.url}city/"`);
    expect(meta(html, 'og:image')).toBe(SITE.ogImage);
    expect(html).not.toContain('name="robots"');
    const graph = jsonLd(html)['@graph'] as Array<Record<string, unknown>>;
    expect(graph.map((n) => n['@type'])).toEqual(['WebSite', 'Person', 'WebPage']);
  });

  test('keeps one h1, the name the glass is drawn over, and the cards for every live project', () => {
    expect(count(html, /<h1[\s>]/g)).toBe(1);
    expect(html).toMatch(/<section class="hero hero--city wrap"/);
    expect(html).toContain('Every project runs live. Scroll.');
    expect(count(html, /<article class="plate"/g)).toBe(6);
    expect(html).toContain('data-stage-entries');
    expect(html).toContain('class="page-city"');
    expect(html).toContain('Back to the portfolio');
  });

  test('the home page itself carries no stage', () => {
    const home = readDoc();
    expect(home).not.toContain('class="page-city"');
    expect(home).not.toContain('hero--city');
    expect(home).toMatch(/href="\/city\/"/);
  });
});
