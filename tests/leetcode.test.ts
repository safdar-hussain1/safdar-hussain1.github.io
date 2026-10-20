import { describe, expect, test } from 'vitest';
import snapshot from '../src/data/leetcode-snapshot.json';
import { readDoc } from './helpers/html';

// The practice section shows LeetCode's own figures, dated; the snapshot must be fresh and consistent.
const html = readDoc();
const section = html.match(/<section id="practice"[\s\S]*?<\/section>/)![0];

describe('practice (LeetCode)', () => {
  test('the snapshot is consistent and carries the date it was taken', () => {
    const { easy, medium, hard, all } = snapshot.solved;
    expect(easy + medium + hard).toBe(all);
    expect(snapshot.languages.reduce((n, l) => n + l.solved, 0)).toBeGreaterThanOrEqual(all);
    expect(snapshot.url).toBe('https://leetcode.com/u/safdar-hussain1/');
    expect(Date.now() - Date.parse(snapshot.fetchedAt)).toBeGreaterThanOrEqual(0);
  });

  test('the section shows exactly the snapshot figures, dated, and links to the profile', () => {
    expect(section).toMatch(new RegExp(`<span class="practice__big num"[^>]*>${snapshot.solved.all}</span>`));
    for (const [n, word] of [[snapshot.solved.easy, 'easy'], [snapshot.solved.medium, 'medium'], [snapshot.solved.hard, 'hard']] as const) {
      expect(section).toMatch(new RegExp(`<b class="num"[^>]*>${n}</b> ${word}`));
    }
    for (const t of snapshot.tags.slice(0, 6)) expect(section).toContain(`>${t.name}</span>`);
    for (const l of snapshot.languages) expect(section).toContain(`>${l.name}</span>`);
    expect(section).toContain(`href="${snapshot.url}"`);
    expect(section).toMatch(/taken on \d{1,2} [A-Z][a-z]{2} \d{4}/);
  });
});
