import { describe, expect, test } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { workSchema, type WorkEntry } from '../src/lib/work-schema';
import { liveEntries } from '../src/lib/work';
import { extractNumbers } from '../src/lib/numbers';

const dir = join(process.cwd(), 'src/content/work');
const entries: WorkEntry[] = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => workSchema.parse(JSON.parse(readFileSync(join(dir, f), 'utf8'))));

async function fetchReadme(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

describe('every figure about a project is a README quote', () => {
  for (const e of liveEntries(entries)) {
    test(`${e.name}: every fact's quote is in the live README`, { timeout: 30_000 }, async (ctx) => {
      const readme = await fetchReadme(e.readme);
      if (readme === null) ctx.skip(true, 'offline: the README could not be fetched');
      for (const fact of e.facts) expect(readme, `${e.slug}: "${fact.quote}"`).toContain(fact.quote);
    });

    test(`${e.name}: every figure in the tagline, the limits and the fact texts is a whole figure of a quote`, () => {
      const quoted = e.facts.map((f) => f.quote).join(' ');
      const has = (text: string, n: string) => extractNumbers(text).includes(n);
      for (const n of extractNumbers(e.tagline)) expect(has(quoted, n), `tagline "${n}"`).toBe(true);
      for (const n of extractNumbers(e.limits)) expect(has(quoted, n), `limits "${n}"`).toBe(true);
      for (const f of e.facts) for (const n of extractNumbers(f.text)) expect(has(f.quote, n), `"${f.text}" → ${n}`).toBe(true);
    });
  }
});
