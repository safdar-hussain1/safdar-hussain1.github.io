import { ladderStep, type LadderStep } from './math';

// Two seconds of frames after the scene settles, then one rung of the ladder: full, without
// shadows, without the ambient life, or the flat site.
export function measureFps(seconds = 2): Promise<number> {
  return new Promise((resolve) => {
    let frames = 0;
    const start = performance.now();
    const tick = (now: number) => {
      frames += 1;
      if (now - start >= seconds * 1000) resolve(frames / ((now - start) / 1000));
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

export async function decideLadder(forced?: number): Promise<{ fps: number; step: LadderStep }> {
  const fps = forced ?? (await measureFps());
  return { fps, step: ladderStep(fps) };
}
