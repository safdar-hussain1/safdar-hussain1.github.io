import { canRunLens, canRunStage, type LadderStep, type StageEnv } from './stage/math';
import { createCaptions } from './captions';

// Decides whether the 3D stage runs, and starts it after the page has painted and the browser
// is idle: the city on a wide screen, the lens alone on a narrow one, nothing under reduced
// motion, Save-Data or without hardware WebGL2. Two seconds in, the frame rate picks a rung
// of the ladder: everything, no shadows, no ambient life, or the flat site again.
type StageState = {
  started: boolean;
  reason?: string;
  mode?: 'lens' | 'city';
  step?: LadderStep;
  fps?: number;
  tour?: { goTo(i: number): void; jumpTo(i: number): void; focus(): number; snap(): void; progress(): number; layout(): void } | null;
  drive?: { start(): void; stop(): void; active(): boolean } | null;
};
type W = Window & { __stage?: StageState; __sound?: { play(cue: 'tick' | 'hum-start' | 'hum-stop' | 'focus'): void } };

const w = window as unknown as W;
const params = new URLSearchParams(location.search);
const still = (document.documentElement.dataset.still ?? null) as 'hero' | 'city' | 'og' | null;

// WebGL2 on a real GPU. A software renderer (SwiftShader, llvmpipe, Mesa's offscreen driver)
// would draw the city at a few frames a second, so it counts as absent; ?softgl=1 overrides
// that for a look at the stage where no GPU exists.
function hardwareWebGL2(): boolean {
  try {
    const c = document.createElement('canvas');
    const soft = params.has('softgl');
    const gl = c.getContext('webgl2', { failIfMajorPerformanceCaveat: !still && !soft });
    if (!gl) return false;
    if (soft) return true;
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
    return !/swiftshader|llvmpipe|softpipe|software|mesa offscreen/i.test(renderer);
  } catch {
    return false;
  }
}

function env(): StageEnv {
  return {
    width: window.innerWidth,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    webgl2: hardwareWebGL2(),
    saveData: Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData),
  };
}

function anyWebGL2(): boolean {
  try {
    return document.createElement('canvas').getContext('webgl2') !== null;
  } catch {
    return false;
  }
}

function decide(): { mode: 'lens' | 'city' | null; reason?: string } {
  if (still === 'og' || params.get('stage') === 'off') return { mode: null, reason: still === 'og' ? 'still' : 'off' };
  const e = env();
  // A still is one frame of the city at any width, but it still respects reduced motion and
  // Save-Data: the still script sets neither, a visitor who does gets the flat page.
  if (still) {
    const g = canRunLens({ ...e, width: 1e4 });
    return g.ok ? { mode: 'city' } : { mode: null, reason: g.reason };
  }
  const cityRun = canRunStage(e);
  if (cityRun.ok) return { mode: 'city' };
  if (cityRun.reason === 'no-webgl2' && anyWebGL2()) return { mode: null, reason: 'software-gl' };
  if (cityRun.reason === 'narrow') {
    const lensRun = canRunLens(e);
    return lensRun.ok ? { mode: 'lens' } : { mode: null, reason: lensRun.reason };
  }
  return { mode: null, reason: cityRun.reason };
}

async function start(): Promise<void> {
  const verdict = decide();
  if (!verdict.mode) {
    w.__stage = { started: false, reason: verdict.reason };
    return;
  }
  const mode = verdict.mode;
  const hero = document.querySelector<HTMLElement>('.hero');
  const entries = JSON.parse(document.querySelector('[data-stage-entries]')?.textContent ?? '[]');
  if (!hero || entries.length === 0) {
    w.__stage = { started: false, reason: 'off' };
    return;
  }
  const canvas = document.createElement('canvas');
  canvas.className = 'stage-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  const textBlock = hero.querySelector<HTMLElement>('.hero__text');
  const h1 = hero.querySelector<HTMLElement>('h1');
  if (mode === 'city') document.body.prepend(canvas);
  else (textBlock ?? hero).prepend(canvas);
  document.body.classList.add(mode === 'city' ? 'stage-pending' : 'lens-pending');

  const { startStage } = await import('./stage/entry');
  const { currentTheme } = await import('./theme');
  const stage = startStage({
    canvas,
    mode,
    entries,
    theme: () => currentTheme(),
    captions: createCaptions(document.body),
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
  });
  await stage.ready;
  document.body.classList.remove('stage-pending', 'lens-pending');
  document.body.classList.add(mode === 'city' ? 'stage-on' : 'lens-on');
  stage.relayout();
  w.__stage = { started: true, mode, step: 'full', tour: stage.tour, drive: stage.drive };
  document.dispatchEvent(new CustomEvent('stage:started'));
  if (still) {
    w.__stage.reason = 'still';
    return;
  }
  const stop = params.get('stop');
  if (stop !== null && stage.tour) stage.tour.jumpTo(Number(stop));

  // The ladder, once, after the scene has settled.
  const forced = params.has('fps') ? Number(params.get('fps')) : undefined;
  setTimeout(async () => {
    const { decideLadder } = await import('./stage/perf');
    const { fps, step } = await decideLadder(forced);
    w.__stage = { ...w.__stage, started: step !== 'flat', fps, step, reason: step === 'flat' ? 'slow' : undefined };
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
