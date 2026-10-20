import { describe, expect, test } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
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
  // Credits inside the 3D libraries' own code: a paper cited in a shader, the animation
  // library's home. Strings, never fetched.
  'https://jcgt.org/published/',
  'https://gsap.com',
];

describe('bundle privacy', () => {
  test('no absolute origin in the shipped scripts and styles beyond the allowed ones', () => {
    const dir = join(process.cwd(), 'docs/_astro');
    const hits: string[] = [];
    const sources: Array<[string, string]> = [];
    for (const f of readdirSync(dir)) {
      if (/\.(js|css)$/.test(f)) sources.push([f, readFileSync(join(dir, f), 'utf8')]);
    }
    // Inline scripts in the pages count too: that is where a stray fetch would hide.
    const pages = ['index.html', '404.html', ...readdirSync(join(process.cwd(), 'docs/work')).map((s) => `work/${s}/index.html`)].filter((p) => existsSync(join(process.cwd(), 'docs', p)));
    for (const page of pages) {
      const html = readFileSync(join(process.cwd(), 'docs', page), 'utf8');
      for (const m of html.matchAll(/<script(?![^>]*type="application\/(ld\+json|json)")[^>]*>([\s\S]*?)<\/script>/g)) sources.push([page, m[2]]);
    }
    for (const [f, text] of sources) {
      for (const m of text.matchAll(/https?:\/\/[^\s"'`)]+/g)) {
        if (!ALLOWED.some((a) => m[0].startsWith(a))) hits.push(`${f}: ${m[0]}`);
      }
    }
    expect(hits).toEqual([]);
  });
});
