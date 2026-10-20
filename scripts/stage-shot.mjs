// Screenshots of the 3D stage on the real GPU: the hero after the focus pull, then every stop.
//   E2E_GL=1 node scripts/stage-shot.mjs [--url http://127.0.0.1:4300/] [--out DIR] [--light] [--stops] [--width 1440] [--height 900] [--query "a=b"]
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
const OUT = opt('--out', join(tmpdir(), 'portfolio-stage'));
const scheme = argv.includes('--light') ? 'light' : 'dark';
const width = Number(opt('--width', 1440));
const height = Number(opt('--height', 900));
const extra = opt('--query', '');
mkdirSync(OUT, { recursive: true });

const browser = await launch({ gl: true });
const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on('console', (m) => {
  if (['error', 'warning'].includes(m.type())) console.log('console', m.type(), m.text().slice(0, 300));
});

async function shot(query, name, settleMs = 2600) {
  const url = `${BASE}?${[query, extra].filter(Boolean).join('&')}`;
  await page.goto(url, { waitUntil: 'networkidle' });
  const started = await page
    .waitForFunction(() => document.body.classList.contains('stage-on') || document.body.classList.contains('lens-on') || (window.__stage && window.__stage.started === false && window.__stage.reason), null, { timeout: 30000 })
    .then(() => page.evaluate(() => window.__stage));
  if (!started?.started) {
    console.log(`stage did not start: ${JSON.stringify(started)}`);
  }
  await page.waitForTimeout(settleMs);
  const file = join(OUT, `${name}-${scheme}${width === 1440 ? '' : `-${width}`}.png`);
  await page.screenshot({ path: file });
  console.log(`wrote ${file}`);
}

await shot('', 'hero');
if (argv.includes('--stops')) {
  const n = await page.evaluate(() => document.querySelectorAll('.plate[data-status="live"]').length);
  for (let i = 0; i < n; i++) await shot(`stop=${i}`, `stop-${i}`, 3200);
}
await browser.close();
