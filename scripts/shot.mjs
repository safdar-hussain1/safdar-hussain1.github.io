// Quick screenshots of a URL in dark, light and at 390px: node scripts/shot.mjs URL OUTDIR
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launch } from './lib/chrome.mjs';

const [url = 'http://127.0.0.1:4300/', out = join(tmpdir(), 'portfolio-shots')] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await launch();
for (const [name, viewport, colorScheme] of [['dark', { width: 1440, height: 900 }, 'dark'], ['light', { width: 1440, height: 900 }, 'light'], ['390', { width: 390, height: 844 }, 'dark']]) {
  const ctx = await browser.newContext({ viewport, colorScheme });
  if (colorScheme === 'light') await ctx.addInitScript(() => localStorage.setItem('portfolio.theme', 'light'));
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.querySelectorAll('[data-reveal]').forEach((el) => el.classList.add('in')));
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
  await ctx.close();
}
await browser.close();
console.log(`wrote dark.png, light.png, 390.png to ${out}`);
