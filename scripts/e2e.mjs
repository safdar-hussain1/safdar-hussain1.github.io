// Browser flows against a running copy of the site (node scripts/serve.mjs, or the live URL):
// every flow checks what a visitor would see and runs axe on it. Prints PASS k/k or the
// failures, and exits 1 on any failure. Screenshots go to a temporary folder unless --shots
// names one; they are never written into the repo.
//
//   node scripts/e2e.mjs [--url http://127.0.0.1:4300/] [--only dock,palette] [--shots DIR] [--browser chrome|webkit|firefox]
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { launch } from './lib/chrome.mjs';

const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : fallback;
};
const BASE = opt('--url', 'http://127.0.0.1:4300/').replace(/\/?$/, '/');
const ONLY = opt('--only', '').split(',').filter(Boolean);
const SHOTS = resolve(opt('--shots', join(tmpdir(), 'portfolio-shots')));
const BROWSER = opt('--browser', process.env.E2E_BROWSER || 'chrome');
mkdirSync(SHOTS, { recursive: true });

const WIDE = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

async function axe(page, label, options = {}) {
  await page.addScriptTag({ path: AXE });
  const result = await page.evaluate((o) => window.axe.run(document, { iframes: false, ...o }), options);
  const bad = result.violations.filter((v) => ['serious', 'critical', 'moderate', 'minor'].includes(v.impact));
  if (bad.length) {
    const lines = bad.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(', ')}`);
    throw new Error(`axe on ${label}: ${bad.length} violation(s)\n    ${lines.join('\n    ')}`);
  }
}

const flows = {
  async 'home-dark'(browser) {
    const ctx = await browser.newContext({ viewport: WIDE, colorScheme: 'dark' });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle' });
    if ((await page.locator('h1').textContent())?.trim() !== 'Safdar Hussain') throw new Error('h1 is not the name');
    if ((await page.locator('.plate[data-status="live"]').count()) !== 6) throw new Error('expected six live cards');
    await page.evaluate(() => document.getElementById('work').scrollIntoView());
    await page.waitForFunction(() => [...document.querySelectorAll('video.loop')].some((v) => !v.paused && v.currentTime > 0), null, { timeout: 20000 });
    await axe(page, 'home dark');
    await page.screenshot({ path: join(SHOTS, `home-dark-${BROWSER}.png`), fullPage: true });
    await ctx.close();
  },
  async 'home-light'(browser) {
    const ctx = await browser.newContext({ viewport: WIDE, colorScheme: 'light' });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await axe(page, 'home light');
    await page.screenshot({ path: join(SHOTS, `home-light-${BROWSER}.png`), fullPage: true });
    await ctx.close();
  },
  async 'home-390'(browser) {
    const ctx = await browser.newContext({ viewport: PHONE, colorScheme: 'dark', isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle' });
    const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (wide) throw new Error('the page scrolls sideways at 390px');
    const href = await page.locator('[data-dock="wardos"]').getAttribute('href');
    if (!href?.includes('/wardos/')) throw new Error('the phone link does not lead to the live site');
    await axe(page, 'home 390');
    await page.screenshot({ path: join(SHOTS, `home-390-${BROWSER}.png`), fullPage: true });
    await ctx.close();
  },
  async 'project-page'(browser) {
    const ctx = await browser.newContext({ viewport: WIDE, colorScheme: 'dark' });
    const page = await ctx.newPage();
    await page.goto(`${BASE}work/wardos/`, { waitUntil: 'networkidle' });
    if ((await page.locator('h1').textContent())?.trim() !== 'WardOS') throw new Error('project h1');
    const src = await page.locator('[data-inline-app] iframe').getAttribute('src');
    if (!src?.endsWith('/wardos/')) throw new Error(`inline frame src is ${src}`);
    const box = await page.locator('[data-inline-app] iframe').boundingBox();
    if (!box || box.width < 900 || box.height < 500) throw new Error(`inline frame is ${box?.width}x${box?.height}`);
    await axe(page, 'project page dark');
    await page.screenshot({ path: join(SHOTS, `project-wardos-${BROWSER}.png`), fullPage: true });
    await ctx.close();
    const light = await browser.newContext({ viewport: WIDE, colorScheme: 'light' });
    const lp = await light.newPage();
    await lp.goto(`${BASE}work/carmine/`, { waitUntil: 'networkidle' });
    await axe(lp, 'project page light');
    await light.close();
  },
  async dock(browser) {
    const ctx = await browser.newContext({ viewport: WIDE, colorScheme: 'dark' });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle' });
    const historyBefore = await page.evaluate(() => history.length);
    await page.locator('[data-dock="wardos"]').click();
    await page.waitForSelector('#dock:not([hidden])');
    const src = await page.locator('#dock iframe').getAttribute('src');
    if (!src?.endsWith('/wardos/')) throw new Error(`dock frame src is ${src}`);
    const frameBox = await page.locator('#dock iframe').boundingBox();
    if (!frameBox || frameBox.width < 1200 || frameBox.height < 700) throw new Error(`dock frame is ${frameBox?.width}x${frameBox?.height}`);
    if ((await page.locator('[data-dock-name]').textContent()) !== 'WardOS') throw new Error('dock bar name');
    if (!(await page.evaluate(() => location.hash)).startsWith('#work/wardos')) throw new Error('dock hash');
    await page.waitForFunction(() => {
      const f = document.querySelector('#dock iframe');
      try {
        return !!f?.contentDocument?.querySelector('h1, h2');
      } catch {
        return false;
      }
    }, null, { timeout: 60000 });
    await axe(page, 'dock open');
    await page.screenshot({ path: join(SHOTS, `dock-wardos-${BROWSER}.png`) });
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press('Tab');
      const inside = await page.evaluate(() => { const a = document.activeElement; return !!a && (a.closest('#dock') !== null); });
      if (!inside) throw new Error(`Tab ${i + 1} left the dock`);
    }
    await page.keyboard.press('Escape');
    await page.waitForSelector('#dock[hidden]', { state: 'attached' });
    if (await page.evaluate(() => location.hash)) throw new Error('hash not cleared on close');
    if ((await page.locator('#dock iframe').count()) !== 0) throw new Error('the frame stayed after close');
    const historyAfter = await page.evaluate(() => history.length);
    if (historyAfter !== historyBefore) throw new Error(`docking added ${historyAfter - historyBefore} history entries`);
    await ctx.close();
  },
  async palette(browser) {
    const ctx = await browser.newContext({ viewport: WIDE, colorScheme: 'dark' });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.keyboard.press('/');
    await page.waitForSelector('#palette:not([hidden])');
    const activeBg = await page.evaluate(() => getComputedStyle(document.querySelector('#palette [role="option"][aria-selected="true"]')).backgroundColor);
    if (!activeBg || activeBg === 'rgba(0, 0, 0, 0)' || activeBg === 'transparent') throw new Error('the selected palette item has no visible background');
    const gap = await page.evaluate(() => { const li = document.querySelector('#palette [role="option"]'); return li.children.length >= 2 ? li.children[1].getBoundingClientRect().left - li.children[0].getBoundingClientRect().right : 99; });
    if (gap < 8) throw new Error(`palette label and hint are ${Math.round(gap)}px apart`);
    await axe(page, 'palette open');
    await page.keyboard.type('about');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => location.hash === '#about', null, { timeout: 5000 });
    await page.waitForTimeout(1500);
    const y = await page.evaluate(() => document.getElementById('about').getBoundingClientRect().top);
    if (y > 200) throw new Error(`palette did not scroll to About (top ${Math.round(y)})`);
    if (!(await page.locator('#palette').isHidden())) throw new Error('palette still open after Enter');
    await ctx.close();
  },
  async 'reduced-motion'(browser) {
    const ctx = await browser.newContext({ viewport: WIDE, colorScheme: 'dark', reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.getElementById('work').scrollIntoView());
    await page.waitForTimeout(1500);
    const videos = await page.evaluate(() => document.querySelectorAll('video.loop').length);
    if (videos) throw new Error(`${videos} loop(s) created under reduced motion`);
    const stage = await page.evaluate(() => window.__stage);
    if (!stage || (stage.started && document.body.classList.contains('stage-on'))) throw new Error('the 3D stage ran under reduced motion');
    await ctx.close();
  },
  async selftest(browser) {
    const ctx = await browser.newContext({ viewport: WIDE, colorScheme: 'dark' });
    const page = await ctx.newPage();
    await page.goto(`${BASE}?selftest=1`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.title.startsWith('PORTFOLIO SELFTEST'), null, { timeout: 60000 });
    const title = await page.title();
    if (!title.startsWith('PORTFOLIO SELFTEST PASS')) throw new Error(title);
    await ctx.close();
  },
};

const names = Object.keys(flows).filter((n) => ONLY.length === 0 || ONLY.includes(n));
const browser = await launch({ browser: BROWSER });
let failed = 0;
for (const name of names) {
  try {
    await flows[name](browser);
    console.log(`ok   ${name}`);
  } catch (e) {
    failed += 1;
    console.log(`FAIL ${name}: ${e.message}`);
  }
}
await browser.close();
console.log(`${failed ? 'FAIL' : 'PASS'} ${names.length - failed}/${names.length} on ${BROWSER}`);
process.exit(failed ? 1 : 0);
