import { describe, expect, test } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// The shipped scripts and styles call out to nothing but the GitHub API. Fonts are bundled,
// there is no analytics, and every other origin in the bundle is one of the named inert strings.
const ALLOWED = [
  'https://api.github.com/',
  'https://github.com/safdar-hussain1',
  'https://safdar-hussain1.github.io/',
  'https://www.linkedin.com/in/safdar-hussain-a8a61b248',
  'http://www.w3.org/',
  'https://raw.githubusercontent.com/safdar-hussain1/',
];

describe('bundle privacy', () => {
  test('no absolute origin in the shipped scripts and styles beyond the allowed ones', () => {
    const dir = join(process.cwd(), 'docs/_astro');
    const hits: string[] = [];
    for (const f of readdirSync(dir)) {
      if (!/\.(js|css)$/.test(f)) continue;
      const text = readFileSync(join(dir, f), 'utf8');
      for (const m of text.matchAll(/https?:\/\/[^\s"'`)]+/g)) {
        if (!ALLOWED.some((a) => m[0].startsWith(a))) hits.push(`${f}: ${m[0]}`);
      }
    }
    expect(hits).toEqual([]);
  });
});
