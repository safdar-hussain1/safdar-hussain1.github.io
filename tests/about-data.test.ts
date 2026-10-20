import { describe, expect, test } from 'vitest';
import about from '../src/data/about.json';
import timeline from '../src/data/timeline.json';
import certificates from '../src/data/certificates.json';
import skills from '../src/data/skills.json';
import { extractNumbers } from '../src/lib/numbers';
import { privateRuns } from './helpers/private';

const everything = JSON.stringify([about, timeline, certificates, skills]);

describe('facts about Safdar', () => {
  test('about has no pending markers', () => {
    expect(everything).not.toMatch(/\[(pending|verify|confirm)\]/i);
  });

  test('about never contains a private number', () => {
    expect(privateRuns(everything)).toEqual([]);
  });

  test('every number in about and timeline text is allowed', () => {
    const texts = [
      ...about.paragraphs,
      ...about.facts.map((f) => f.text),
      about.outside,
      about.now.text,
      ...timeline.map((t) => `${t.title} ${t.role} ${t.text} ${'points' in t ? (t.points as string[]).join(' ') : ''}`),
      ...certificates.map((c) => `${c.name} ${c.issuer}`),
      ...skills.flatMap((g) => [g.name, ...g.items]),
    ];
    for (const text of texts) {
      for (const n of extractNumbers(text)) expect(about.allowed, `"${n}" in "${text}"`).toContain(n);
    }
  });

  test('extractNumbers ignores digits glued to names', () => {
    expect(extractNumbers('B.Tech 2022–2026, CGPA 9.19, WebGL2, CS50, 1,200 rows')).toEqual(['2022', '2026', '9.19', '1,200']);
  });

  test('timeline has seven items in date order', () => {
    expect(timeline).toHaveLength(7);
    const keys = timeline.map((t) => t.when.padEnd(7, '-'));
    expect([...keys].sort()).toEqual(keys);
    for (const t of timeline) expect(t.when).toMatch(/^\d{4}(-\d{2})?$/);
    for (const t of timeline) expect(['work', 'education', 'community', 'talk']).toContain(t.kind);
    expect(timeline.filter((t) => t.ongoing).map((t) => t.title)).toEqual(['Navatej Technologies']);
  });

  test('swara is null until Safdar supplies it', () => {
    expect(about.swara).toBeNull();
  });

  test('the building-now note is dated this year', () => {
    expect(about.now.date).toMatch(/^2026-\d{2}$/);
  });
});
