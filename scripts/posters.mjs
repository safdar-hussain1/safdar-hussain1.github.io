// Derives work/<slug>/poster-sm.webp from each committed poster.webp without recapturing.
import { readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeSmallPoster } from './lib/posters.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const work = join(root, 'public/work');
for (const slug of readdirSync(work)) {
  const big = join(work, slug, 'poster.webp');
  if (!existsSync(big)) continue;
  const info = await writeSmallPoster(big, join(work, slug, 'poster-sm.webp'));
  console.log(`${slug}/poster-sm.webp  ${Math.round(info.size / 1024)} KB`);
}
