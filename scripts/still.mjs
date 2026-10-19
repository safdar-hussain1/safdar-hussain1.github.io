// Renders the preview pictures with the installed Chrome: og-image.png for the home page and
// one og.png per project page, each 1200×630. Run after `npm run build`; the pictures land
// in public/ and reach docs/ on the next build.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const docs = join(root, 'docs');
const port = 4399;
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

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

async function savePng(buffer, out) {
  mkdirSync(dirname(out), { recursive: true });
  await sharp(buffer).png({ compressionLevel: 9, palette: true, quality: 90 }).toFile(out);
  const kb = Math.round(statSync(out).size / 1024);
  console.log(`${out.replace(root + '/', '')}  ${kb} KB${kb > 500 ? '  TOO BIG' : ''}`);
}

await withServer(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, colorScheme: 'dark' });
  const page = await ctx.newPage();
  if (only.length === 0 || only.includes('home')) {
    await page.goto(`http://127.0.0.1:${port}/?still=hero`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await savePng(await page.screenshot({ type: 'png' }), join(root, 'public/og-image.png'));
  }
  for (const slug of slugs) {
    if (!existsSync(join(root, 'public/work', slug, 'poster.webp'))) {
      console.log(`${slug}: no poster yet, skipped`);
      continue;
    }
    await page.goto(`http://127.0.0.1:${port}/work/${slug}/?still=og`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    await savePng(await page.screenshot({ type: 'png' }), join(root, 'public/work', slug, 'og.png'));
  }
  await browser.close();
});
