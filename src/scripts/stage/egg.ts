import * as THREE from 'three';
import { steer, type CarState, type Keys, type Road } from './math';

// The hidden drive: type "drive" anywhere (or pick it in the palette) and the arrow keys
// take the Sightline car along the road with the camera close behind. Esc gives it back.
export interface Drive {
  start(): void;
  stop(): void;
  active(): boolean;
  update(dt: number): void;
}

export interface DriveOptions {
  car: THREE.Object3D;
  camera: THREE.PerspectiveCamera;
  road: Road;
  doc: Document;
  onStart(): void;
  onStop(): void;
}

export function createDrive(opts: DriveOptions): Drive {
  const { car, camera, road, doc } = opts;
  let on = false;
  let state: CarState = { x: 0, z: road.laneZ[0], speed: 0, heading: 0 };
  const keys: Keys = { left: false, right: false, up: false, down: false };
  const look = new THREE.Vector3();
  const want = new THREE.Vector3();

  function setKey(e: KeyboardEvent, v: boolean): boolean {
    switch (e.key) {
      case 'ArrowLeft':
        keys.left = v;
        return true;
      case 'ArrowRight':
        keys.right = v;
        return true;
      case 'ArrowUp':
        keys.up = v;
        return true;
      case 'ArrowDown':
        keys.down = v;
        return true;
    }
    return false;
  }

  function onDown(e: KeyboardEvent): void {
    if (!on) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      stop();
      return;
    }
    if (setKey(e, true)) e.preventDefault();
  }
  function onUp(e: KeyboardEvent): void {
    if (on) setKey(e, false);
  }

  // The word, typed anywhere outside a field, with no modifier, within a few seconds.
  let buffer = '';
  let lastAt = 0;
  function onType(e: KeyboardEvent): void {
    if (on || e.metaKey || e.ctrlKey || e.altKey || e.key.length !== 1) return;
    const t = e.target as HTMLElement | null;
    if (t && t.closest('input, textarea, select, [contenteditable]')) return;
    const now = performance.now();
    if (now - lastAt > 2500) buffer = '';
    lastAt = now;
    buffer = (buffer + e.key.toLowerCase()).slice(-5);
    if (buffer === 'drive') start();
  }

  function start(): void {
    if (on) return;
    on = true;
    state = { x: car.position.x, z: car.position.z, speed: 0.5, heading: 0 };
    doc.addEventListener('keydown', onDown, true);
    doc.addEventListener('keyup', onUp, true);
    opts.onStart();
  }
  function stop(): void {
    if (!on) return;
    on = false;
    keys.left = keys.right = keys.up = keys.down = false;
    doc.removeEventListener('keydown', onDown, true);
    doc.removeEventListener('keyup', onUp, true);
    opts.onStop();
  }

  doc.addEventListener('keydown', onType);

  return {
    start,
    stop,
    active: () => on,
    update(dt) {
      if (!on) return;
      state = steer(state, keys, dt, road);
      car.position.set(state.x, 0, state.z);
      car.rotation.y = -state.heading;
      // The camera follows three units behind and a little above, easing toward its spot.
      want.set(state.x - 3 * Math.cos(state.heading), 1.4, state.z + 3 * Math.sin(state.heading));
      camera.position.lerp(want, 1 - Math.exp(-dt / 0.18));
      look.set(state.x + 1.5, 0.35, state.z);
      camera.lookAt(look);
    },
  };
}
