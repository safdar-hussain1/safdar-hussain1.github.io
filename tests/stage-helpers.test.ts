import { describe, expect, test } from 'vitest';
import { canRunLens, canRunStage, ladderStep, lifeClock, progressForStop, seeded, smoothstep, steer, stopLayout, tourProgress } from '../src/scripts/stage/math';
import { PALETTES } from '../src/scripts/stage/palette';

const ok = { width: 1440, reducedMotion: false, webgl2: true, saveData: false };

describe('stage helpers', () => {
  test('canRunStage refuses narrow, reduced motion, no WebGL2 and Save-Data with the reason', () => {
    expect(canRunStage(ok)).toEqual({ ok: true });
    expect(canRunStage({ ...ok, width: 800 }).reason).toBe('narrow');
    expect(canRunStage({ ...ok, reducedMotion: true }).reason).toBe('reduced-motion');
    expect(canRunStage({ ...ok, webgl2: false }).reason).toBe('no-webgl2');
    expect(canRunStage({ ...ok, saveData: true }).reason).toBe('save-data');
  });

  test('canRunLens allows narrow screens', () => {
    expect(canRunLens({ ...ok, width: 390 })).toEqual({ ok: true });
    expect(canRunLens({ ...ok, width: 390, reducedMotion: true }).reason).toBe('reduced-motion');
  });

  test('ladderStep thresholds', () => {
    expect(ladderStep(60)).toBe('full');
    expect(ladderStep(50)).toBe('full');
    expect(ladderStep(35)).toBe('no-shadows');
    expect(ladderStep(25)).toBe('no-life');
    expect(ladderStep(10)).toBe('flat');
  });

  test('seeded random is deterministic', () => {
    const a = seeded(7);
    const b = seeded(7);
    const xs = Array.from({ length: 5 }, () => a());
    expect(Array.from({ length: 5 }, () => b())).toEqual(xs);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(seeded(8)()).not.toBe(seeded(7)());
  });

  test('stopLayout places eight stops along the road on alternating sides', () => {
    const stops = stopLayout(8);
    expect(stops.map((s) => s.x)).toEqual([-14, -10, -6, -2, 2, 6, 10, 14]);
    expect(stops.map((s) => s.side)).toEqual([1, -1, 1, -1, 1, -1, 1, -1]);
  });

  test('tourProgress dives first, then rests at every stop', () => {
    expect(tourProgress(0, 6)).toMatchObject({ dive: 0, road: 0, idx: 0, focus: 0, near: 1 });
    expect(tourProgress(0.1, 6)).toMatchObject({ dive: 0.5, road: 0 });
    expect(tourProgress(0.2, 6)).toMatchObject({ dive: 1, road: 0, idx: 0 });
    expect(tourProgress(1, 6)).toMatchObject({ dive: 1, road: 1, idx: 5, focus: 5, near: 1 });
    // Just past a stop the camera still rests on it.
    const resting = tourProgress(0.2 + (0.8 / 5) * 0.1, 6);
    expect(resting.idx).toBeCloseTo(0, 5);
    const halfway = tourProgress(0.2 + (0.8 / 5) * 0.5, 6);
    expect(halfway.idx).toBeCloseTo(0.5, 2);
    expect(halfway.near).toBeCloseTo(0, 5);
  });

  test('progressForStop inverts tourProgress at every stop, with any dive length', () => {
    for (const diveEnd of [0.2, 0.11]) {
      for (let i = 0; i < 6; i++) {
        const t = tourProgress(progressForStop(i, 6, diveEnd), 6, diveEnd);
        expect(t.focus).toBe(i);
        expect(t.near).toBeCloseTo(1, 5);
        expect(t.dive).toBe(1);
      }
    }
    expect(progressForStop(0, 1)).toBe(0.2);
  });

  test('both palettes carry every key', () => {
    const keys = Object.keys(PALETTES.dark).sort();
    expect(keys).toEqual(Object.keys(PALETTES.light).sort());
    for (const p of [PALETTES.dark, PALETTES.light]) {
      expect(p.fog[0]).toBeLessThan(p.fog[1]);
      expect(Object.values(p).every((v) => v !== undefined && v !== null)).toBe(true);
    }
  });

  test('smoothstep clamps and eases', () => {
    expect(smoothstep(0, 1, -1)).toBe(0);
    expect(smoothstep(0, 1, 2)).toBe(1);
    expect(smoothstep(0, 1, 0.5)).toBe(0.5);
  });

  test('lifeClock keeps every car on the road', () => {
    const road = { xMin: -15, xMax: 15, laneZ: [0.5, -0.55] as [number, number] };
    for (let t = 0; t < 120; t += 0.37) {
      const life = lifeClock(t, -10 + t * 0.2, road);
      for (const c of [life.sightline, ...life.others]) {
        expect(c.x).toBeGreaterThanOrEqual(road.xMin);
        expect(c.x).toBeLessThanOrEqual(road.xMax);
      }
    }
    expect(lifeClock(22, 0, road).ambulanceOut).toBe(true);
    expect(lifeClock(5, 0, road).ambulanceOut).toBe(false);
  });

  test('steer keeps the car within the road and the speed within bounds', () => {
    const road = { xMin: -15, xMax: 15, laneZ: [0.5, -0.55] as [number, number] };
    let s = { x: 0, z: 0.5, speed: 0, heading: 0 };
    for (let i = 0; i < 600; i++) s = steer(s, { left: true, right: false, up: true, down: false }, 1 / 60, road);
    expect(s.speed).toBeLessThanOrEqual(6);
    expect(s.z).toBeLessThanOrEqual(0.8);
    expect(s.x).toBeLessThanOrEqual(15);
    for (let i = 0; i < 600; i++) s = steer(s, { left: false, right: true, up: false, down: true }, 1 / 60, road);
    expect(s.speed).toBeGreaterThanOrEqual(0);
    expect(s.z).toBeGreaterThanOrEqual(-0.85);
  });
});
