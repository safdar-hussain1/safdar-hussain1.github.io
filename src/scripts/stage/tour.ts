import * as THREE from 'three';
import { clamp, lerp, progressForStop, smoothstep, tourProgress } from './math';
import type { Building } from './buildings';
import type { Facade } from './facade';
import type { CityHandle } from './city';
import type { Captions } from '../captions';

// The camera on its rails: the dive from the hero through the lens down to the road, then the
// road from stop to stop, all driven by the scrollbar with a short lag so it never snaps.
// The work section is tall and its caption panel sticky; the maths maps scroll to progress.
export interface TourOptions {
  camera: THREE.PerspectiveCamera;
  hero: { pos: THREE.Vector3; look: THREE.Vector3 };
  lensPos: () => THREE.Vector3;
  stops: Building[];
  facades: Map<string, Facade>;
  captions: Captions;
  city: CityHandle;
  doc: Document;
  onFocus?: (i: number) => void;
  pointer: { x: number; y: number };
}

export interface TourFrame {
  p: number;
  dive: number;
  road: number;
  idx: number;
  focus: number;
  near: number;
  fade: number;
  inTour: boolean;
}

export interface Tour {
  update(now: number, dt: number): TourFrame;
  goTo(i: number): void;
  /** Straight to a stop, no scrolling animation and no lag. */
  jumpTo(i: number): void;
  layout(): void;
  progress(): number;
  setFollowing(on: boolean): void;
  /** Drops the lag: the camera is where the scrollbar says, now. */
  snap(): void;
  focus(): number;
  destroy(): void;
}

const LAG = 0.22; // seconds: the time constant of the scroll lag
const LANDED = 0.9995; // the dive counts as finished from here (floating point never reaches 1 exactly)
const LOOK_RIGHT = -0.85; // the screen sits right of centre, leaving the caption its room at the left
const UP = new THREE.Vector3(0, 1, 0);
const WARM = new THREE.Color('#ffd2a0');

export function createTour(opts: TourOptions): Tour {
  const { camera, hero, stops, facades, captions, city, doc } = opts;
  const n = stops.length;
  const win = doc.defaultView!;
  let S = 1;
  let diveEnd = 0.2;
  let tailStart = 0.95;
  let target = 0;
  let p = 0;
  let following = true;
  let lastFocus = -1;
  let litFocus = -1;
  let curve = new THREE.CatmullRomCurve3([hero.pos, hero.pos, hero.pos, hero.pos]);
  const pos = new THREE.Vector3();
  const look = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const accent = new THREE.Color();
  const frame: TourFrame = { p: 0, dive: 0, road: 0, idx: 0, focus: 0, near: 1, fade: 1, inTour: false };

  function layout(): void {
    const work = doc.getElementById('work');
    const vh = win.innerHeight;
    if (!work) return;
    const top = work.offsetTop;
    const bottom = top + work.offsetHeight;
    S = Math.max(1, bottom - vh);
    const tail = Math.min(0.6 * vh, work.offsetHeight * 0.1);
    diveEnd = clamp(top / S, 0.02, 0.6);
    tailStart = clamp((S - tail) / S, diveEnd + 0.05, 0.999);
    const lens = opts.lensPos();
    const first = stops[0]?.anchor ?? new THREE.Vector3(-17.4, 1.75, -1.6);
    const mid = lens.clone().lerp(first, 0.55);
    mid.y = lerp(lens.y, first.y, 0.4);
    mid.z = lerp(lens.z, first.z, 0.3);
    curve = new THREE.CatmullRomCurve3([hero.pos.clone(), lens.clone(), mid, first.clone()], false, 'centripetal');
    readScroll();
  }

  function readScroll(): void {
    target = clamp(win.scrollY / S);
  }

  function scrollForStop(i: number): number {
    const k = clamp(i, 0, n - 1);
    return progressForStop(k, n, diveEnd / tailStart) * tailStart * S;
  }

  function goTo(i: number): void {
    layout();
    win.scrollTo({ top: scrollForStop(i), behavior: 'smooth' });
  }

  function jumpTo(i: number): void {
    layout();
    win.scrollTo({ top: scrollForStop(i), behavior: 'instant' as ScrollBehavior });
    readScroll();
    p = target;
  }

  // Arrows and digits move along the road; the browser's own shortcuts (Back, tab switching)
  // and anything typed into a field, the dock or the palette are left alone.
  function onKey(e: KeyboardEvent): void {
    if (!frame.inTour || !following) return;
    if (e.altKey || e.metaKey || e.ctrlKey || e.defaultPrevented) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.closest('input, textarea, select, [contenteditable]') || t.closest('#dock, #palette'))) return;
    if (doc.body.classList.contains('dock-open')) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      goTo(lastFocus < 0 ? 0 : lastFocus + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      goTo(lastFocus < 0 ? 0 : lastFocus - 1);
    } else if (/^[1-9]$/.test(e.key) && Number(e.key) <= n) {
      goTo(Number(e.key) - 1);
    }
  }

  const rail = doc.querySelector<HTMLElement>('.rail');
  const onRail = (e: Event) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('button[data-i]');
    if (b) goTo(Number(b.dataset.i));
  };
  rail?.addEventListener('click', onRail);
  win.addEventListener('scroll', readScroll, { passive: true });
  doc.addEventListener('keydown', onKey);
  // The keyboard landing in a caption brings the camera to its stop.
  captions.onFocus((slug) => {
    const i = stops.findIndex((b) => b.entry.slug === slug);
    if (i >= 0) jumpTo(i);
  });
  layout();
  p = target;

  function aimRight(amount: number): void {
    forward.subVectors(look, pos).normalize();
    right.crossVectors(forward, UP).normalize();
    look.addScaledVector(right, amount);
  }

  function update(now: number, dt: number): TourFrame {
    if (following) p += (target - p) * (1 - Math.exp(-dt / LAG));
    const pTour = clamp(p / tailStart);
    const tp = tourProgress(pTour, n, diveEnd / tailStart);
    const fade = 1 - smoothstep(tailStart, 1, p);
    const landed = tp.dive >= LANDED;
    const dive = landed ? 1 : tp.dive;
    const inTour = p > 0.001 && fade > 0.5;

    if (following) {
      if (!landed) {
        const e = smoothstep(0, 1, tp.dive);
        curve.getPointAt(e, pos);
        look.copy(hero.look).lerp(stops[0].lookAt, smoothstep(0.3, 1, tp.dive));
        // The pointer sways the hero view a little; the sway dies with the dive. The look
        // offset of the stops eases in over the last stretch, so landing changes nothing.
        const sway = 1 - tp.dive;
        pos.z += opts.pointer.x * 0.18 * sway;
        pos.y += opts.pointer.y * 0.1 * sway;
        aimRight(LOOK_RIGHT * smoothstep(0.7, 1, tp.dive));
      } else {
        const i0 = Math.floor(tp.idx);
        const i1 = Math.min(n - 1, i0 + 1);
        const f = tp.idx - i0;
        pos.copy(stops[i0].anchor).lerp(stops[i1].anchor, f);
        look.copy(stops[i0].lookAt).lerp(stops[i1].lookAt, f);
        pos.y += Math.sin(now / 2600) * 0.015;
        aimRight(LOOK_RIGHT);
      }
      camera.position.copy(pos);
      camera.lookAt(look);
    }

    // Lights: the warm pool walks beside the camera and leans toward the accent of the stop in
    // focus; the accent spot fades in with the landing and lights the stop's facade.
    const focused = stops[tp.focus];
    const landing = smoothstep(0.85, 1, dive);
    city.walkLight.position.set(camera.position.x + 0.8, 2.3, camera.position.z);
    if (focused && landing > 0) {
      if (litFocus !== tp.focus) {
        litFocus = tp.focus;
        accent.set(focused.entry.accent);
        city.accentLight.color.copy(accent);
      }
      city.accentLight.intensity = 70 * tp.near * landing * city.accentScale;
      city.accentLight.position.set(focused.x - 1.4, 4.6, focused.lookAt.z - focused.side * 1.2);
      city.accentLight.target.position.copy(focused.lookAt);
      city.accentLight.target.updateMatrixWorld();
      city.walkLight.color.lerpColors(WARM, accent, 0.55 * tp.near * landing);
    } else {
      city.accentLight.intensity = 0;
      city.walkLight.color.copy(WARM);
    }

    // Captions and facades: the stop in focus is told so; its neighbours keep their loops warm.
    if (landed && inTour) {
      if (lastFocus !== tp.focus) {
        lastFocus = tp.focus;
        captions.setActive(focused.entry.slug);
        opts.onFocus?.(tp.focus);
      }
    } else if (lastFocus !== -1) {
      lastFocus = -1;
      captions.clear();
    }
    stops.forEach((b, i) => {
      const k = i === tp.focus && landed ? tp.near : 0;
      b.setFocus(k);
      const facade = facades.get(b.entry.slug);
      if (!facade) return;
      facade.setFocus(k);
      const warm = tp.dive >= 0.8 && Math.abs(i - tp.idx) <= 1.5 && fade > 0.05;
      if (warm) facade.play();
      else facade.pause();
    });
    frame.p = p;
    frame.dive = dive;
    frame.road = tp.road;
    frame.idx = tp.idx;
    frame.focus = tp.focus;
    frame.near = tp.near;
    frame.fade = fade;
    frame.inTour = inTour;
    return frame;
  }

  return {
    update,
    goTo,
    jumpTo,
    layout,
    progress: () => p,
    setFollowing: (on) => {
      following = on;
    },
    snap() {
      readScroll();
      p = target;
    },
    focus: () => lastFocus,
    destroy() {
      win.removeEventListener('scroll', readScroll);
      doc.removeEventListener('keydown', onKey);
      rail?.removeEventListener('click', onRail);
      captions.onFocus(() => {});
    },
  };
}
