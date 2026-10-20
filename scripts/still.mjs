// Renders the pictures that stand in for the city: og-image.png (1200×630, the lens over the
// name over the city), hero-still.webp (1600×1000, the city itself, shown by the flat hero)
// and one og.png per project page. Needs a build and the real GPU for the city; where the
// stage cannot start, the home preview falls back to the typographic hero and says so.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { launch } from './lib/chrome.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const docs = join(root, 'docs');
const port = 4399;
const base = `http://127.0.0.1:${port}`;

const only = process.argv.slice(2);
const slugs = readdirSync(join(root, 'src/content/work'))
  .map((f) => JSON.parse(readFileSync(join(root, 'src/content/work', f), 'utf8')))
  .filter((e) => e.status === 'live')
  .map((e) => e.slug)
  .filter((s) => only.length === 0 || only.includes(s));

async function withServer(fn) {
  const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: docs, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 700));
  try {
    await fn();
  } finally {
    server.kill();
  }
}

function report(out) {
  const kb = Math.round(statSync(out).size / 1024);
  console.log(`${out.replace(root + '/', '')}  ${kb} KB`);
  return kb;
}

async function savePng(buffer, out) {
  mkdirSync(dirname(out), { recursive: true });
  await sharp(buffer).png({ compressionLevel: 9, palette: true, quality: 90 }).toFile(out);
  if (report(out) > 500) console.log('  TOO BIG (over 500 KB)');
}

// Waits for the stage to render its still, or to say it cannot; true when the city is in the picture.
async function stageStill(page) {
  await page.waitForFunction(() => document.title === 'STILL READY' || (window.__stage && window.__stage.started === false && !['still', 'pending'].includes(window.__stage.reason)), null, { timeout: 40000 });
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(() => document.title === 'STILL READY');
}

await withServer(async () => {
  const browser = await launch({ gl: true });
  if (only.length === 0 || only.includes('home')) {
    const og = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, colorScheme: 'dark' });
    const page = await og.newPage();
    await page.goto(`${base}/city/?still=hero`, { waitUntil: 'networkidle' });
    const city = await stageStill(page);
    if (!city) console.log('og-image: the stage did not start here, so this is the typographic hero');
    await savePng(await page.screenshot({ type: 'png' }), join(root, 'public/og-image.png'));
    await og.close();

    const wide = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1, colorScheme: 'dark' });
    const hero = await wide.newPage();
    await hero.goto(`${base}/city/?still=city`, { waitUntil: 'networkidle' });
    if (await stageStill(hero)) {
      const png = await hero.screenshot({ type: 'png' });
      await sharp(png).webp({ quality: 78, effort: 6 }).toFile(join(root, 'public/hero-still.webp'));
      report(join(root, 'public/hero-still.webp'));
      await sharp(png).resize(800, 500).webp({ quality: 76, effort: 6 }).toFile(join(root, 'public/hero-still-sm.webp'));
      report(join(root, 'public/hero-still-sm.webp'));
    } else {
      console.log('hero-still: the stage did not start here (no GPU?), the picture was left as it was');
    }
    await wide.close();
  }
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, colorScheme: 'dark' });
  const page = await ctx.newPage();
  for (const slug of slugs) {
    if (!existsSync(join(root, 'public/work', slug, 'poster.webp'))) {
      console.log(`${slug}: no poster yet, skipped`);
      continue;
    }
    await page.goto(`${base}/work/${slug}/?still=og`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    await savePng(await page.screenshot({ type: 'png' }), join(root, 'public/work', slug, 'og.png'));
  }
  await browser.close();
});
