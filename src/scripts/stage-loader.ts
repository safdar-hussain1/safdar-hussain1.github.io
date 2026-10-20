import { canRunLens, canRunStage, type LadderStep, type StageEnv } from './stage/math';
import { createCaptions } from './captions';
import type { Tour } from './stage/tour';
import type { Drive } from './stage/egg';
import type { StageHandle } from './stage/entry';

// Decides whether the 3D stage runs, and starts it after the page has painted and the browser
// is idle: the city on a wide screen, the lens alone on a tablet, nothing on a phone, under
// reduced motion, Save-Data or without hardware WebGL2. Two seconds in, the frame rate picks a
// rung of the ladder: everything, no shadows, no moving traffic, or the flat site again.
// `window.__stage` says what happened; `stage:decided` fires once it is known, `stage:started`
// when the city or the lens is on, `stage:ended` if it goes away again.
export type StageState = {
  started: boolean;
  reason?: string;
  mode?: 'lens' | 'city';
  step?: LadderStep;
  fps?: number | null;
  tour?: Pick<Tour, 'goTo' | 'jumpTo' | 'focus' | 'snap' | 'progress' | 'layout'> | null;
  drive?: Pick<Drive, 'start' | 'stop' | 'active'> | null;
};
type W = Window & { __stage?: StageState; __sound?: { play(cue: 'tick' | 'hum-start' | 'hum-stop' | 'focus'): void } };

const w = window as unknown as W;
const params = new URLSearchParams(location.search);
const still = (document.documentElement.dataset.still ?? null) as 'hero' | 'city' | 'og' | null;

function decided(state: StageState): void {
  w.__stage = state;
  document.dispatchEvent(new CustomEvent('stage:decided'));
}

// WebGL2 on a real GPU. A software renderer (SwiftShader, llvmpipe, Mesa's offscreen driver,
// Windows' basic render driver) would draw the city at a few frames a second, so it counts as
// absent; ?softgl=1 overrides that for a look at the stage where no GPU exists. The probe's
// context is released at once.
function probeWebGL2(): { any: boolean; hardware: boolean } {
  try {
    const c = document.createElement('canvas');
    const soft = params.has('softgl');
    const gl = c.getContext('webgl2', { failIfMajorPerformanceCaveat: !still && !soft });
    if (!gl) return { any: c.getContext('webgl2') !== null, hardware: false };
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    const software = /swiftshader|llvmpipe|softpipe|software|mesa offscreen|basic render driver|warp/i.test(renderer);
    return { any: true, hardware: soft || !software };
  } catch {
    return { any: false, hardware: false };
  }
}

function env(webgl2: boolean): StageEnv {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    webgl2,
    saveData: Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData),
  };
}

function decide(): { mode: 'lens' | 'city' | null; reason?: string } {
  if (still === 'og' || params.get('stage') === 'off') return { mode: null, reason: still === 'og' ? 'still' : 'off' };
  // The cheap gates first: no GPU context is created for a phone or a reduced-motion visit.
  const cheap = env(true);
  const stillRun = still ? canRunLens({ ...cheap, width: 1e4 }) : null;
  if (stillRun && !stillRun.ok) return { mode: null, reason: stillRun.reason };
  if (!still && !canRunLens(cheap).ok) return { mode: null, reason: canRunLens(cheap).reason };
  const gl = probeWebGL2();
  const e = env(gl.hardware);
  const glReason = gl.any ? 'software-gl' : 'no-webgl2';
  // A still is one frame of the city at any width, with the same gates otherwise.
  if (still) return gl.hardware ? { mode: 'city' } : { mode: null, reason: glReason };
  const cityRun = canRunStage(e);
  if (cityRun.ok) return { mode: 'city' };
  if (cityRun.reason === 'no-webgl2') return { mode: null, reason: glReason };
  if (cityRun.reason === 'narrow') {
    const lensRun = canRunLens(e);
    return lensRun.ok ? { mode: 'lens' } : { mode: null, reason: lensRun.reason };
  }
  return { mode: null, reason: cityRun.reason };
}

async function start(): Promise<void> {
  const verdict = decide();
  if (!verdict.mode) {
    decided({ started: false, reason: verdict.reason });
    return;
  }
  const mode = verdict.mode;
  const hero = document.querySelector<HTMLElement>('.hero');
  const entries = JSON.parse(document.querySelector('[data-stage-entries]')?.textContent ?? '[]');
  if (!hero || entries.length === 0) {
    decided({ started: false, reason: 'off' });
    return;
  }
  const canvas = document.createElement('canvas');
  canvas.className = 'stage-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  const textBlock = hero.querySelector<HTMLElement>('.hero__text');
  const h1 = hero.querySelector<HTMLElement>('h1');
  if (mode === 'city') document.body.prepend(canvas);
  else (textBlock ?? hero).prepend(canvas);

  const ended = (reason: 'slow' | 'reduced-motion') => {
    w.__stage = { started: false, reason, mode };
    document.dispatchEvent(new CustomEvent('stage:ended'));
  };

  let stage: StageHandle;
  try {
    const { startStage } = await import('./stage/entry');
    const { currentTheme } = await import('./theme');
    stage = startStage({
      canvas,
      mode,
      entries,
      theme: () => currentTheme(),
      captions: createCaptions(document.body, () => currentTheme()),
      still: still === 'hero' || still === 'city' ? still : null,
      wrapLeft: () => Math.max(16, (window.innerWidth - 1120) / 2),
      // Where the page's own name sits, as fractions of the canvas, so the glass name lands on it.
      anchor: () => {
        if (!h1) return null;
        const r = h1.getBoundingClientRect();
        const c = canvas.getBoundingClientRect();
        if (!c.width || !c.height || !r.width) return null;
        return { x: (r.left - c.left) / c.width, y: (r.top - c.top) / c.height, w: r.width / c.width, h: r.height / c.height };
      },
      sound: w.__sound ?? null,
      onEnd: ended,
    });
    await stage.ready;
  } catch (err) {
    // The chunk did not arrive or the renderer refused: the flat page stays, and says so.
    canvas.remove();
    decided({ started: false, reason: 'error' });
    console.warn('The city could not start:', err);
    return;
  }
  document.body.classList.add(mode === 'city' ? 'stage-on' : 'lens-on');
  stage.relayout();
  decided({ started: true, mode, step: 'full', tour: stage.tour, drive: stage.drive });
  document.dispatchEvent(new CustomEvent('stage:started'));
  if (still) {
    w.__stage!.reason = 'still';
    return;
  }
  const stop = params.get('stop');
  if (stop !== null && stage.tour) stage.tour.jumpTo(Number(stop));

  // The ladder, once, after the scene has settled; a docked project postpones it.
  const forced = params.has('fps') ? Number(params.get('fps')) : undefined;
  setTimeout(async () => {
    const { decideLadder } = await import('./stage/perf');
    const { fps, step } = await decideLadder(forced, { busy: () => document.body.classList.contains('dock-open') });
    if (!w.__stage?.started) return;
    if (step === 'flat') {
      stage.applyLadder(step);
      w.__stage = { started: false, reason: 'slow', mode, fps, step };
      document.dispatchEvent(new CustomEvent('stage:ended'));
      return;
    }
    w.__stage = { ...w.__stage, fps, step };
    stage.applyLadder(step);
  }, 2600);
}

function whenIdle(fn: () => void): void {
  const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  if (still) fn();
  else if (ric) ric(fn, { timeout: 1500 });
  else setTimeout(fn, 300);
}

if (document.readyState === 'complete') whenIdle(() => void start());
else window.addEventListener('load', () => whenIdle(() => void start()), { once: true });
