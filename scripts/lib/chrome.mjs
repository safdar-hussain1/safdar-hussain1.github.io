// The installed Chrome, driven by playwright-core. CHROME_PATH overrides the default location.
// Without E2E_GL the browser renders WebGL in software so the flows run anywhere; with it,
// the real GPU is used, which the 3D checks and the captures need.
import { existsSync } from 'node:fs';
import { chromium, firefox, webkit } from 'playwright-core';

const CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
].filter(Boolean);

export function chromePath() {
  const found = CANDIDATES.find((p) => existsSync(p));
  if (!found) throw new Error('No Chrome found. Set CHROME_PATH.');
  return found;
}

export async function launch({ gl = Boolean(process.env.E2E_GL), browser = process.env.E2E_BROWSER || 'chrome' } = {}) {
  // WebKit and Firefox come from Playwright's own builds (`npx playwright-core install webkit firefox`),
  // for the cross-browser checks; Chrome is the installed one.
  if (browser === 'webkit') return webkit.launch({ headless: true });
  if (browser === 'firefox') return firefox.launch({ headless: true });
  const args = gl ? ['--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  return chromium.launch({ executablePath: chromePath(), headless: true, args });
}
