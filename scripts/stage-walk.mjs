// A walk through the stage on the real GPU: frames of the dive, the road between two stops,
// then a dock opened from a facade and closed again. For looking at, not for asserting.
//   E2E_GL=1 node scripts/stage-walk.mjs [--url http://127.0.0.1:4300/] [--out DIR] [--light]
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launch } from './lib/chrome.mjs';

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : fallback;
};
const BASE = opt('--url', 'http://127.0.0.1:4300/').replace(/\/?$/, '/');
const OUT = opt('--out', join(tmpdir(), 'portfolio-walk'));
const scheme = argv.includes('--light') ? 'light' : 'dark';
mkdirSync(OUT, { recursive: true });

const browser = await launch({ gl: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: scheme, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForFunction(() => document.body.classList.contains('stage-on'), null, { timeout: 30000 });
await page.waitForTimeout(2200);
const shot = async (name) => {
  await page.screenshot({ path: join(OUT, `${name}-${scheme}.png`) });
  console.log(`wrote ${name}`);
};

// The dive: fractions of the hero's height.
const vh = 900;
for (const f of [0.12, 0.3, 0.45, 0.6, 0.8, 1.0]) {
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), f * vh);
  await page.evaluate(() => window.__stage?.tour?.snap());
  await page.waitForTimeout(500);
  await shot(`dive-${String(Math.round(f * 100)).padStart(3, '0')}`);
}
// Between the first two stops.
const stop = await page.evaluate(() => {
  const t = window.__stage.tour;
  t.jumpTo(0);
  return window.scrollY;
});
const next = await page.evaluate(() => {
  const t = window.__stage.tour;
  t.jumpTo(1);
  return window.scrollY;
});
for (const f of [0.25, 0.5, 0.75]) {
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), stop + (next - stop) * f);
  await page.evaluate(() => window.__stage?.tour?.snap());
  await page.waitForTimeout(500);
  await shot(`road-${f * 100}`);
}
// The dock from the facade.
await page.evaluate(() => window.__stage.tour.jumpTo(0));
await page.waitForTimeout(800);
await page.click('.plate.on [data-dock]');
await page.waitForTimeout(450);
await shot('fly-mid');
await page.waitForTimeout(1200);
await shot('docked');
await page.click('[data-dock-close]');
await page.waitForTimeout(300);
await shot('fly-back-mid');
await page.waitForTimeout(900);
await shot('undocked');
const state = await page.evaluate(() => ({ stage: { ...window.__stage, tour: undefined, drive: undefined }, scrollY: window.scrollY, on: document.querySelector('.plate.on')?.dataset.slug, railHidden: document.querySelector('.rail')?.hidden }));
console.log(JSON.stringify(state));
// The end of the road and after it.
await page.evaluate(() => window.__stage.tour.jumpTo(5));
await page.waitForTimeout(600);
await shot('last-stop');
await page.evaluate(() => window.scrollTo({ top: document.getElementById('work').offsetTop + document.getElementById('work').offsetHeight - window.innerHeight * 1.3, behavior: 'instant' }));
await page.evaluate(() => window.__stage?.tour?.snap());
await page.waitForTimeout(600);
await shot('tail');
await page.evaluate(() => document.getElementById('how').scrollIntoView());
await page.waitForTimeout(800);
await shot('after');
await browser.close();
