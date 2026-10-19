import { describe, expect, test } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { workSchema, type WorkEntry } from '../src/lib/work-schema';
import { liveEntries } from '../src/lib/work';
import { CHOREO } from '../scripts/choreography.mjs';

const root = process.cwd();
const entriesDir = join(root, 'src/content/work');
const entries: WorkEntry[] = readdirSync(entriesDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => workSchema.parse(JSON.parse(readFileSync(join(entriesDir, f), 'utf8'))));
const live = liveEntries(entries).map((e) => e.slug);

const FILES = ['poster.webp', 'poster-sm.webp', 'loop.webm', 'loop.mp4'] as const;
const POSTERS = ['poster.webp'] as const;
const LOOPS = ['loop.webm', 'loop.mp4'] as const;

// The limits are written in decimal, so a file that passes is under them however "KB" is read.
const POSTER_BUDGET = 150_000;
const LOOP_BUDGET = 1_500_000;

const file = (slug: string, name: string) => join(root, 'public/work', slug, name);
const bytes = (slug: string, name: string) => statSync(file(slug, name)).size;

type Manifest = Record<
  string,
  {
    capturedAt: string;
    title: string;
    poster: { bytes: number };
    loop: { seconds: number; webmBytes: number; mp4Bytes: number };
  }
>;
const manifestPath = join(root, 'public/work/manifest.json');
const readManifest = (): Manifest => JSON.parse(readFileSync(manifestPath, 'utf8'));

describe('captures', () => {
  test('every live entry has its four capture files', () => {
    expect(live.length).toBeGreaterThan(0);
    for (const slug of live) {
      for (const name of FILES) {
        expect(existsSync(file(slug, name)), `${slug}/${name} exists`).toBe(true);
        expect(bytes(slug, name), `${slug}/${name} is not empty`).toBeGreaterThan(0);
      }
    }
  });

  test('the choreography covers exactly the live entries', () => {
    expect(Object.keys(CHOREO).sort()).toEqual([...live].sort());
  });

  test('posters are under 150 KB and 1600x1000', async () => {
    for (const slug of live) {
      for (const name of POSTERS) {
        const meta = await sharp(file(slug, name)).metadata();
        expect(meta.format, `${slug}/${name} format`).toBe('webp');
        expect([meta.width, meta.height], `${slug}/${name} size`).toEqual([1600, 1000]);
        expect(bytes(slug, name), `${slug}/${name} bytes`).toBeLessThan(POSTER_BUDGET);
      }
    }
  });

  test('loops are under 1.5 MB each', () => {
    for (const slug of live) {
      for (const name of LOOPS) {
        expect(bytes(slug, name), `${slug}/${name} bytes`).toBeLessThanOrEqual(LOOP_BUDGET);
      }
    }
  });

  test('manifest names every live slug with a capture date', () => {
    const manifest = readManifest();
    for (const slug of live) {
      const entry = manifest[slug];
      expect(entry, `${slug} is in the manifest`).toBeDefined();
      // ISO 8601 as written by Date#toISOString: it parses, and it prints back the same way.
      expect(new Date(entry.capturedAt).toISOString(), `${slug} capturedAt`).toBe(entry.capturedAt);
      expect(entry.title.trim().length, `${slug} title`).toBeGreaterThan(0);
      expect(entry.loop.seconds, `${slug} loop seconds`).toBe(8);
    }
  });

  test('manifest sizes are the sizes of the files on disk', () => {
    const manifest = readManifest();
    for (const slug of live) {
      const entry = manifest[slug];
      expect(entry.poster.bytes, `${slug} poster`).toBe(bytes(slug, 'poster.webp'));
      expect(entry.loop.webmBytes, `${slug} webm`).toBe(bytes(slug, 'loop.webm'));
      expect(entry.loop.mp4Bytes, `${slug} mp4`).toBe(bytes(slug, 'loop.mp4'));
    }
  });
});
