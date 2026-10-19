import { describe, expect, test } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import about from '../src/data/about.json';
import timeline from '../src/data/timeline.json';
import { readDoc } from './helpers/html';
import { privateRuns } from './helpers/private';

const html = readDoc();
const section = (id: string) => html.match(new RegExp(`<section id="${id}"[\\s\\S]*?<\\/section>`))![0];

describe('how I work, timeline, about and contact', () => {
  test('how i work has four principles each with a README link', () => {
    const how = section('how');
    expect((how.match(/<h3[\s>]/g) ?? []).length).toBe(4);
    expect((how.match(/href="https:\/\/github\.com\/safdar-hussain1\/[a-z-]+#readme"/g) ?? []).length).toBe(4);
    for (const t of ['Measure, don’t claim', 'Break it on purpose', 'Publish the bad number', 'It runs on your device']) expect(how).toContain(t);
  });

  test('timeline renders seven items in order', () => {
    const tl = section('timeline');
    const items = tl.match(/<li class="timeline__item"/g) ?? [];
    expect(items).toHaveLength(7);
    const titles = [...tl.matchAll(/<h3[^>]*>([^<]+)<\/h3>/g)].map((m) => m[1]);
    expect(titles).toEqual(timeline.map((t) => t.title));
  });

  test('about shows the dated note, CGPA 9.19 and the scholarship, and no phone number', () => {
    const ab = section('about');
    expect(ab).toContain(`October 2026 · ${about.now.text}`);
    expect(ab).toContain('CGPA 9.19');
    expect(ab).toContain('Academic Scholarship all four years');
    expect(privateRuns(html)).toEqual([]);
  });

  test('swara entry is absent while the data is null', () => {
    expect(section('about')).not.toContain('Swara');
  });

  test('contact shows the email and the two links', () => {
    const c = section('contact');
    expect(c).toContain('safdarhussaindudekula@gmail.com');
    expect(c).toContain('href="https://github.com/safdar-hussain1"');
    expect(c).toContain('href="https://www.linkedin.com/in/safdar-hussain-a8a61b248"');
    expect(c).toContain('id="copy-email"');
  });

  test('no all-caps labels anywhere in the shipped styles', () => {
    const cssDir = join(process.cwd(), 'docs/_astro');
    const css = readdirSync(cssDir)
      .filter((f) => f.endsWith('.css'))
      .map((f) => readFileSync(join(cssDir, f), 'utf8'))
      .join('\n');
    expect(css).not.toMatch(/text-transform:\s*uppercase/);
  });
});
