// @vitest-environment happy-dom
import { describe, expect, test } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import snapshot from '../src/data/github-snapshot.json';
import { workSchema, type WorkEntry } from '../src/lib/work-schema';
import { liveEntries } from '../src/lib/work';
import { readDoc } from './helpers/html';
import { paint } from '../src/scripts/github-board';
import type { RepoStatus } from '../src/lib/github';

const html = readDoc();
const section = html.match(/<section id="measured"[\s\S]*?<\/section>/)![0];
const dir = join(process.cwd(), 'src/content/work');
const entries: WorkEntry[] = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => workSchema.parse(JSON.parse(readFileSync(join(dir, f), 'utf8'))));

describe('measured section', () => {
  test('the numbers board shows up to three facts per live project, each linking to its README', () => {
    for (const e of liveEntries(entries)) {
      for (const f of e.facts.slice(0, 3)) expect(section).toMatch(new RegExp(`<a href="${f.source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>${f.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</a>`));
    }
  });

  test('the GitHub board renders the snapshot rows server-side and says when it was taken', () => {
    expect(section).toContain('Snapshot taken');
    for (const e of liveEntries(entries)) expect(section).toMatch(new RegExp(`<li class="ledger__row" data-repo="${e.slug}" data-source="snapshot"`));
    expect(section).toContain(`data-snapshot-date="${snapshot.fetchedAt}"`);
  });

  test('painting live rows relabels the caption and the push dates', () => {
    document.body.innerHTML = section;
    const root = document.getElementById('github-board')!;
    const now = () => new Date('2026-10-22T10:00:00Z');
    const rows: RepoStatus[] = (snapshot.rows as RepoStatus[]).map((r) => ({ ...r, source: 'live', pushedAt: '2026-10-19T13:08:13Z' }));
    paint(root, rows, now);
    expect(root.querySelector('[data-gh-caption]')!.textContent).toMatch(/^Live from GitHub/);
    expect(root.querySelector('[data-repo="wardos"] [data-field="pushedAt"]')!.textContent).toBe('2 days ago');
    expect(root.querySelector('[data-repo="wardos"]')!.getAttribute('data-source')).toBe('live');
    expect(root.querySelector('[data-repo="wardos"] [data-field="ci"]')!.textContent).toBe('tests passing');
  });

  test('painting snapshot-only rows says GitHub did not answer', () => {
    document.body.innerHTML = section;
    const root = document.getElementById('github-board')!;
    paint(root, (snapshot.rows as RepoStatus[]).map((r) => ({ ...r, source: 'snapshot' })), () => new Date());
    expect(root.querySelector('[data-gh-caption]')!.textContent).toMatch(/^GitHub did not answer/);
  });
});
