// Pure helpers for the stage: what may run where, the performance ladder, the scroll maths,
// the layout of the stops and the ambient life. No DOM, no Three, so they are tested plainly.

export interface StageEnv {
  width: number;
  /** The viewport's height; a phone held sideways is wide but has no room for the city. */
  height?: number;
  reducedMotion: boolean;
  webgl2: boolean;
  saveData: boolean;
}

export type StageReason = 'narrow' | 'reduced-motion' | 'no-webgl2' | 'save-data';

export function canRunStage(env: StageEnv): { ok: boolean; reason?: StageReason } {
  if (env.reducedMotion) return { ok: false, reason: 'reduced-motion' };
  if (env.saveData) return { ok: false, reason: 'save-data' };
  if (!env.webgl2) return { ok: false, reason: 'no-webgl2' };
  if (env.width < 900 || (env.height !== undefined && env.height < 500)) return { ok: false, reason: 'narrow' };
  return { ok: true };
}

// The lens alone may run on a screen too narrow for the city, down to a tablet's width; a
// phone keeps the still (the glass costs about two seconds of a slow phone's main thread).
export const LENS_MIN_WIDTH = 600;

export function canRunLens(env: StageEnv): { ok: boolean; reason?: StageReason } {
  if (env.reducedMotion) return { ok: false, reason: 'reduced-motion' };
  if (env.saveData) return { ok: false, reason: 'save-data' };
  if (!env.webgl2) return { ok: false, reason: 'no-webgl2' };
  if (env.width < LENS_MIN_WIDTH || (env.height !== undefined && env.height < 500)) return { ok: false, reason: 'narrow' };
  return { ok: true };
}

export type LadderStep = 'full' | 'no-shadows' | 'no-life' | 'flat';

export function ladderStep(fps: number): LadderStep {
  if (fps >= 50) return 'full';
  if (fps >= 30) return 'no-shadows';
  if (fps >= 20) return 'no-life';
  return 'flat';
}

export const clamp = (v: number, lo = 0, hi = 1): number => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export function smoothstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

// mulberry32: a small seeded generator, so the city is the same on every visit.
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The stops along the road: four units apart, alternating sides, the first on the camera's
// right (+z) as it travels along +x.
export const STOP_GAP = 4;
export const STOP_X0 = -14;

export function stopLayout(n: number): Array<{ x: number; side: 1 | -1 }> {
  return Array.from({ length: n }, (_, i) => ({ x: STOP_X0 + i * STOP_GAP, side: i % 2 === 0 ? 1 : -1 }));
}

// Scroll progress 0..1 across the hero and the work section: the first part (the hero's own
// height, a fifth by default) is the dive through the lens, the rest travels the road and
// rests at each stop.
export interface TourProgress {
  dive: number;
  road: number;
  idx: number;
  focus: number;
  near: number;
}

export function tourProgress(p: number, n: number, diveEnd = 0.2): TourProgress {
  const dive = clamp(p / diveEnd);
  const road = clamp((p - diveEnd) / (1 - diveEnd));
  const raw = road * Math.max(0, n - 1);
  const base = Math.floor(raw);
  const frac = raw - base;
  const idx = Math.min(n - 1, base + smoothstep(0.18, 0.82, frac));
  const focus = Math.round(idx);
  const near = clamp(1 - Math.abs(idx - focus) * 2);
  return { dive, road, idx, focus, near };
}

// The progress at which the camera rests on stop i: the inverse of tourProgress.
export function progressForStop(i: number, n: number, diveEnd = 0.2): number {
  if (n <= 1) return diveEnd;
  return diveEnd + (clamp(i, 0, n - 1) / (n - 1)) * (1 - diveEnd);
}

export interface Road {
  xMin: number;
  xMax: number;
  laneZ: [number, number];
}

export interface Life {
  sightline: { x: number; z: number };
  others: Array<{ x: number; z: number; dir: 1 | -1 }>;
  ambulanceOut: boolean;
  blink: boolean;
}

// Where everything that moves is at time t: the Sightline car ahead of the camera, two cars
// passing the other way, the ambulance out for six seconds in every forty, beacons at 1 Hz.
export function lifeClock(t: number, cameraX: number, road: Road): Life {
  const span = road.xMax - road.xMin;
  const wrap = (x: number) => road.xMin + ((((x - road.xMin) % span) + span) % span);
  const sightline = { x: clamp(cameraX + 6.5 + Math.sin(t * 0.7) * 0.35, road.xMin, road.xMax), z: road.laneZ[0] };
  const others: Life['others'] = [0, 13].map((offset) => ({ x: wrap(road.xMax - (t * 1.6 + offset)), z: road.laneZ[1], dir: -1 as const }));
  const phase = t % 40;
  return { sightline, others, ambulanceOut: phase >= 20 && phase < 26, blink: Math.floor(t * 2) % 2 === 0 };
}

export interface CarState {
  x: number;
  z: number;
  speed: number;
  heading: number;
}

export interface Keys {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
}

// The easter egg: arrow keys drive the car along the road, never off its edges.
export function steer(state: CarState, keys: Keys, dt: number, road: Road): CarState {
  const accel = keys.up ? 4 : keys.down ? -4 : -1.5;
  const speed = clamp(state.speed + accel * dt, 0, 6);
  const turn = (keys.left ? 1 : 0) - (keys.right ? 1 : 0);
  const heading = clamp(state.heading + turn * dt * 1.8, -0.6, 0.6);
  const x = clamp(state.x + Math.cos(heading) * speed * dt, road.xMin, road.xMax);
  const z = clamp(state.z - Math.sin(heading) * speed * dt, Math.min(...road.laneZ) - 0.3, Math.max(...road.laneZ) + 0.3);
  return { x, z, speed, heading: turn === 0 ? heading * (1 - clamp(dt * 3)) : heading };
}
