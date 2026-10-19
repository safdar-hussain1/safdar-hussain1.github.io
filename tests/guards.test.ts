import { describe, expect, test } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The public repo must not carry the words that tell a project's history, build-process
// traces, machine paths or private files. The phrases are assembled from fragments so this
// file never trips its own scan.
function tracked(): string[] | null {
  try {
    return execFileSync('git', ['ls-files', '-z'], { cwd: process.cwd(), encoding: 'utf8' }).split('\0').filter(Boolean);
  } catch {
    return null;
  }
}

const join2 = (a: string, b: string) => a + b;
const PHRASES: RegExp[] = [
  new RegExp('\\b' + join2('re', 'build') + '\\b', 'i'),
  new RegExp('\\b' + join2('col', 'lege') + '\\b', 'i'),
  new RegExp('\\b' + join2('course', 'work') + '\\b', 'i'),
  new RegExp('\\b' + join2('origin', 'ally') + '\\b', 'i'),
  new RegExp('\\b' + join2('up', 'grade') + '\\b', 'i'),
  new RegExp('\\bv' + join2('[1', '2]') + '\\b', 'i'),
  new RegExp(join2('co-auth', 'ored'), 'i'),
  new RegExp(join2('cla', 'ude'), 'i'),
  new RegExp(join2('anthro', 'pic'), 'i'),
  new RegExp(join2('super', 'powers'), 'i'),
  new RegExp(join2('sub', 'agent'), 'i'),
  new RegExp('\\btask ' + join2('\\d', '+\\b'), 'i'),
  new RegExp('\\bthe ' + join2('bri', 'ef') + '\\b', 'i'),
  new RegExp('\\bthe ' + join2('revi', 'ewer') + '\\b', 'i'),
];
const TEXT = /\.(astro|ts|mjs|js|json|css|md|txt|xml|yml|yaml|html|svg)$/;
const SKIP = [/^package-lock\.json$/, /^docs\/_astro\//, /^public\/work\//, /^docs\/work\//];

const files = tracked();
const textFiles = (files ?? []).filter((f) => TEXT.test(f) && !SKIP.some((re) => re.test(f)));

describe.skipIf(files === null)('tracked files', () => {
  test('nothing private is tracked', () => {
    expect(files).not.toContain(['CLA', 'UDE.md'].join(''));
    expect(files!.some((f) => f.startsWith(['.super', 'powers/'].join('')))).toBe(false);
    expect(files!.some((f) => f.startsWith('private/'))).toBe(false);
    expect(files).toContain('docs/.nojekyll');
    expect(files).toContain('public/.nojekyll');
  });

  test('no tracked text file contains a banned phrase', () => {
    const hits: string[] = [];
    for (const f of textFiles) {
      const text = readFileSync(join(process.cwd(), f), 'utf8');
      for (const re of PHRASES) {
        const m = re.exec(text);
        if (m) hits.push(`${f}: "${m[0]}"`);
      }
    }
    expect(hits).toEqual([]);
  });

  test('no tracked file contains a machine path', () => {
    const hits = textFiles.filter((f) => /\/Users\/[a-z]/.test(readFileSync(join(process.cwd(), f), 'utf8')));
    expect(hits).toEqual([]);
  });
});
