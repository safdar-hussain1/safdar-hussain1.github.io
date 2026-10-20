import { ladderStep, type LadderStep } from './math';

// The frame rate, measured once the scene has settled, picks a rung of the ladder: everything,
// without shadows, without the moving traffic, or the flat page. A pause is not slowness: long
// gaps between frames are dropped, the window restarts if the tab is hidden or a project is
// docked meanwhile, and a machine that could not be measured keeps everything.
export const MAX_DELTA_MS = 100;

/** Frames per second from frame intervals: the 75th percentile interval, pauses dropped. */
export function fpsFromDeltas(deltas: number[], maxDelta = MAX_DELTA_MS): number | null {
  const kept = deltas.filter((d) => d > 0 && d <= maxDelta).sort((a, b) => a - b);
  if (kept.length < 30) return null;
  const p75 = kept[Math.min(kept.length - 1, Math.floor(kept.length * 0.75))];
  return 1000 / p75;
}

export interface MeasureOptions {
  frames?: number;
  doc?: Document;
  /** True while something else owns the screen (a docked project): the window is abandoned. */
  busy?: () => boolean;
}

export function measureFps(opts: MeasureOptions = {}): Promise<number | null> {
  const frames = opts.frames ?? 90;
  const doc = opts.doc ?? document;
  return new Promise((resolve) => {
    const deltas: number[] = [];
    let last = 0;
    const tick = (now: number) => {
      if (doc.hidden || opts.busy?.()) {
        resolve(null);
        return;
      }
      if (last) deltas.push(now - last);
      last = now;
      if (deltas.length >= frames) resolve(fpsFromDeltas(deltas));
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function decideLadder(forced?: number, opts: MeasureOptions = {}): Promise<{ fps: number | null; step: LadderStep }> {
  if (forced !== undefined && Number.isFinite(forced)) return { fps: forced, step: ladderStep(forced) };
  for (let attempt = 0; attempt < 3; attempt++) {
    const fps = await measureFps(opts);
    if (fps !== null) return { fps, step: ladderStep(fps) };
    await wait(3000);
  }
  return { fps: null, step: 'full' };
}
