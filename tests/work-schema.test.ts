import { describe, expect, test } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { workSchema, type WorkEntry } from '../src/lib/work-schema';
import { allEntries, liveEntries } from '../src/lib/work';
import { contrast } from '../scripts/lib/contrast.mjs';

const dir = join(process.cwd(), 'src/content/work');
const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
const entries: WorkEntry[] = files.map((f) => workSchema.parse(JSON.parse(readFileSync(join(dir, f), 'utf8'))));

const ACCENTS: Record<string, string> = {
  wardos: '#0369a1',
  nightingale: '#8b2f6b',
  trafficlens: '#b45309',
  'red-light-green-light-cv': '#15803d',
  carmine: '#a4133c',
  homecast: '#4338ca',
  wavelength: '#0d9488',
  sightline: '#9333ea',
};

describe('work collection', () => {
  test('every entry parses against the schema and is named after its file', () => {
    expect(files).toHaveLength(8);
    for (const f of files) expect(entries.some((e) => e.slug === f.replace('.json', ''))).toBe(true);
  });

  test('orders are 1..8 and unique', () => {
    expect(allEntries(entries).map((e) => e.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  test('accents match the table in the spec', () => {
    for (const e of entries) expect(e.accent, e.slug).toBe(ACCENTS[e.slug]);
  });

  test('six entries are live and two are scenery', () => {
    expect(liveEntries(entries).map((e) => e.slug)).toEqual(['wardos', 'nightingale', 'trafficlens', 'red-light-green-light-cv', 'carmine', 'homecast']);
    expect(entries.filter((e) => e.status === 'scenery').map((e) => e.slug).sort()).toEqual(['sightline', 'wavelength']);
  });

  test('accentInk passes 4.5:1 on both grounds', () => {
    for (const e of entries) {
      expect(contrast(e.accentInk.dark, '#0b1020'), `${e.slug} dark`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(e.accentInk.light, '#edeff4'), `${e.slug} light`).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('live entries point at their own site, repo and README', () => {
    for (const e of liveEntries(entries)) {
      expect(e.live).toBe(`https://safdar-hussain1.github.io/${e.slug}/`);
      expect(e.repo).toBe(`https://github.com/safdar-hussain1/${e.slug}`);
      expect(e.readme).toBe(`https://raw.githubusercontent.com/safdar-hussain1/${e.slug}/main/README.md`);
      expect(e.facts.length).toBeGreaterThanOrEqual(3);
    }
  });

  test('WardOS carries the Health Haven related link', () => {
    const w = entries.find((e) => e.slug === 'wardos')!;
    expect(w.related?.href).toBe('https://github.com/safdar-hussain1/health-haven');
  });
});
