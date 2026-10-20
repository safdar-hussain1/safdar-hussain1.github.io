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

// Full-page captures never scroll, so the sections that rise into view on scroll are shown first.
async function revealAll(page) {
  // Without the transition, so a slow frame cannot leave a section half-faded when axe reads it.
  await page.evaluate(() =>
    document.querySelectorAll('[data-reveal]').forEach((el) => {
      el.style.transition = 'none';
      el.classList.add('in');
    }),
  );
  await page.waitForTimeout(300);
}

async function axe(page, label, options = {}) {
  await revealAll(page);
  await page.addScriptTag({ path: AXE });
  const result = await page.evaluate((o) => window.axe.run(document, { iframes: false, ...o }), options);
  const bad = result.violations.filter((v) => ['serious', 'critical', 'moderate', 'minor'].includes(v.impact));
  if (bad.length) {
    const lines = bad.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(', ')}`);
    throw new Error(`axe on ${label}: ${bad.length} violation(s)\n    ${lines.join('\n    ')}`);
  }
}

// The dock and the palette flows test the flat page's own dock and palette, so they open the
// page with the city switched off; the stage and tour flows cover the city.
const flows = {
  async 'home-dark'(browser) {
    const ctx = await browser.newContext({ viewport: WIDE, colorScheme: 'dark' });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle' });
    if ((await page.locator('h1').textContent())?.trim() !== 'Safdar Hussain') throw new Error('h1 is not the name');
    if ((await page.locator('.plate[data-status="live"]').count()) !== 6) throw new Error('expected six live cards');
    // The page's own smooth scroll, then a long wait: a software-rendered Chrome decodes the first loop slowly.
    await page.evaluate(() => document.getElementById('projects').scrollIntoView());
    await page.waitForFunction(() => [...document.querySelectorAll('video.loop')].some((v) => !v.paused && v.currentTime > 0), null, { timeout: 45000 });
    const nav = await page.evaluate(() => [...document.querySelectorAll('.mast__nav a')].map((a) => a.textContent.trim()));
    if (nav.join('|') !== 'Projects|Experience|Skills|Practice|About|Contact|3D city') throw new Error(`nav reads ${nav.join('|')}`);
    await axe(page, 'home dark');
    await revealAll(page);
    await page.screenshot({ path: join(SHOTS, `home-dark-${BROWSER}.png`), fullPage: true });
    await ctx.close();
  },
  // The light theme is the visitor's switch (the site is dark whatever the system says).
  async 'home-light'(browser) {
    const ctx = await browser.newContext({ viewport: WIDE, colorScheme: 'light' });
    await ctx.addInitScript(() => localStorage.setItem('portfolio.theme', 'light'));
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle' });
    if ((await page.evaluate(() => document.documentElement.dataset.theme)) !== 'light') throw new Error('the light theme did not apply');
    await axe(page, 'home light');
    await revealAll(page);
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
    await revealAll(page);
    await page.screenshot({ path: join(SHOTS, `home-390-${BROWSER}.png`), fullPage: true });
    await ctx.close();
  },
  async 'project-page'(browser) {
    const ctx = await browser.newContext({ viewport: WIDE, colorScheme: 'dark' });
    const page = await ctx.newPage();
    await page.goto(`${BASE}work/wardos/`, { waitUntil: 'networkidle' });
    if ((await page.locator('h1').textContent())?.trim() !== 'WardOS') throw new Error('project h1');
    // With the project sites mounted (locally) the app is framed full size; without them (CI)
    // the frame gives way to the poster and the note, which is the fallback the page promises.
    await page.waitForFunction(() => !!document.querySelector('[data-inline-app] iframe') || !document.querySelector('[data-app-note]').hidden, null, { timeout: 30000 });
    if (await page.locator('[data-inline-app] iframe').count()) {
      const src = await page.locator('[data-inline-app] iframe').getAttribute('src');
      if (!src?.endsWith('/wardos/')) throw new Error(`inline frame src is ${src}`);
      const box = await page.locator('[data-inline-app] iframe').boundingBox();
      if (!box || box.width < 900 || box.height < 500) throw new Error(`inline frame is ${box?.width}x${box?.height}`);
      console.log('     the app is framed');
    } else {
      if (!(await page.locator('[data-app-poster]').isVisible())) throw new Error('neither the app nor its poster is shown');
      console.log('     no project site here, the poster fallback is shown');
    }
    await axe(page, 'project page dark');
    await revealAll(page);
    await page.screenshot({ path: join(SHOTS, `project-wardos-${BROWSER}.png`), fullPage: true });
    await ctx.close();
    const light = await browser.newContext({ viewport: WIDE, colorScheme: 'light' });
    await light.addInitScript(() => localStorage.setItem('portfolio.theme', 'light'));
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
    // The scroll is smooth and the page is long; under software rendering it can take seconds to arrive.
    const arrived = await page
      .waitForFunction(() => document.getElementById('about').getBoundingClientRect().top <= 200, null, { timeout: 8000, polling: 100 })
      .then(() => true, () => false);
    const y = await page.evaluate(() => document.getElementById('about').getBoundingClientRect().top);
    if (!arrived || y > 200) throw new Error(`palette did not scroll to About (top ${Math.round(y)})`);
    if (!(await page.locator('#palette').isHidden())) throw new Error('palette still open after Enter');
    await ctx.close();
  },
  async 'reduced-motion'(browser) {
    const ctx = await browser.newContext({ viewport: WIDE, colorScheme: 'dark', reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.getElementById('projects').scrollIntoView());
    await page.waitForTimeout(1500);
    const videos = await page.evaluate(() => document.querySelectorAll('video.loop').length);
    if (videos) throw new Error(`${videos} loop(s) created under reduced motion`);
    const revealed = await page.evaluate(() => [...document.querySelectorAll('[data-reveal]')].every((el) => getComputedStyle(el).opacity === '1'));
    if (!revealed) throw new Error('a section stayed hidden under reduced motion');
    // The city page keeps the flat cards under reduced motion and says why.
    await page.goto(`${BASE}city/`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__stage && window.__stage.reason !== 'pending', null, { timeout: 30000 });
    const stage = await page.evaluate(() => window.__stage);
    if (!stage || stage.started || stage.reason !== 'reduced-motion') throw new Error(`the city under reduced motion: ${JSON.stringify(stage)}`);
    await ctx.close();
  },
  // The 3D stage needs the real GPU; without E2E_GL these two flows report themselves skipped.
  async stage(browser) {
    if (!process.env.E2E_GL) {
      console.log('     stage: skipped (needs E2E_GL=1 and a GPU)');
      return;
    }
    const ctx = await browser.newContext({ viewport: WIDE, colorScheme: 'dark' });
    const page = await ctx.newPage();
    const CITY = `${BASE}city/`;
    await page.goto(CITY, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.body.classList.contains('stage-on'), null, { timeout: 30000 });
    const seen = await page.evaluate(() => ({
      canvases: document.querySelectorAll('canvas.stage-canvas').length,
      h1: document.querySelectorAll('h1').length,
      stage: { ...window.__stage, tour: undefined, drive: undefined },
    }));
    if (seen.canvases !== 1) throw new Error(`expected one stage canvas, saw ${seen.canvases}`);
    if (seen.h1 !== 1) throw new Error('the h1 must stay in the DOM under the stage');
    if (!seen.stage.started || seen.stage.mode !== 'city') throw new Error(`stage did not start: ${JSON.stringify(seen.stage)}`);
    await page.waitForTimeout(2200);
    await axe(page, 'home with the stage');
    await page.screenshot({ path: join(SHOTS, `stage-hero-${BROWSER}.png`) });
    // The ladder: a forced 35 fps keeps the city without shadows; a forced 10 fps returns the
    // flat site and says why.
    await page.goto(`${CITY}?fps=35`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__stage && window.__stage.step === 'no-shadows', null, { timeout: 30000 });
    const dim = await page.evaluate(() => ({ canvases: document.querySelectorAll('canvas.stage-canvas').length, on: document.body.classList.contains('stage-on'), started: window.__stage.started }));
    if (dim.canvases !== 1 || !dim.on || !dim.started) throw new Error(`the city should stay on without shadows: ${JSON.stringify(dim)}`);
    await page.goto(`${CITY}?fps=10`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__stage && window.__stage.reason === 'slow', null, { timeout: 30000 });
    const flat = await page.evaluate(() => ({ canvases: document.querySelectorAll('canvas.stage-canvas').length, on: document.body.classList.contains('stage-on') }));
    if (flat.canvases !== 0 || flat.on) throw new Error('the flat site did not return after the ladder');
    // The selftest with the stage running.
    await page.goto(`${CITY}?selftest=1`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.title.startsWith('PORTFOLIO SELFTEST'), null, { timeout: 60000 });
    const title = await page.title();
    if (!title.startsWith('PORTFOLIO SELFTEST PASS')) throw new Error(title);
    await ctx.close();
  },
  async tour(browser) {
    if (!process.env.E2E_GL) {
      console.log('     tour: skipped (needs E2E_GL=1 and a GPU)');
      return;
    }
    const ctx = await browser.newContext({ viewport: WIDE, colorScheme: 'dark' });
    const page = await ctx.newPage();
    await page.goto(`${BASE}city/`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.body.classList.contains('stage-on'), null, { timeout: 30000 });
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.__stage.tour.jumpTo(3));
    await page.waitForFunction(() => document.querySelector('.plate.on')?.dataset.slug === 'red-light-green-light-cv', null, { timeout: 10000 });
    const tick = await page.evaluate(() => document.querySelector('.rail button[aria-current="true"]')?.dataset.i);
    if (tick !== '3') throw new Error(`rail tick is ${tick}, expected 3`);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: join(SHOTS, `stage-stop-4-${BROWSER}.png`) });
    await axe(page, 'a stop in the city');
    // The keyboard moves along the road.
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => document.querySelector('.plate.on')?.dataset.slug === 'carmine', null, { timeout: 10000 });
    // The dock opens from the facade and the caption returns after.
    await page.waitForTimeout(800);
    await page.click('.plate.on [data-dock]');
    await page.waitForSelector('#dock iframe', { timeout: 15000 });
    const src = await page.getAttribute('#dock iframe', 'src');
    if (!src?.endsWith('/carmine/')) throw new Error(`dock framed ${src}`);
    await page.click('[data-dock-close]');
    await page.waitForFunction(() => document.querySelector('.plate.on')?.dataset.slug === 'carmine' && !document.body.classList.contains('fly-on'), null, { timeout: 10000 });
    // Back to the top: the lens is back and the captions are gone.
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.evaluate(() => window.__stage.tour.snap());
    await page.waitForFunction(() => !document.querySelector('.plate.on') && !document.body.classList.contains('tour-on'), null, { timeout: 10000 });
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
