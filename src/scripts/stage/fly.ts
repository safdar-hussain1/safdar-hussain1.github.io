import * as THREE from 'three';
import gsap from 'gsap';
import type { Building } from './buildings';
import { SCREEN_H } from './facade';

// The dock's two moments in the city: the camera dollies into the facade screen until it
// fills the view, the dock opens; on close, the camera returns to where the tour had it.
export interface Fly {
  toFacade(b: Building, ms?: number): Promise<void>;
  back(ms?: number): Promise<void>;
  flying(): boolean;
}

export function createFly(camera: THREE.PerspectiveCamera): Fly {
  const saved = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
  let busy = false;
  return {
    flying: () => busy,
    toFacade(b, ms = 600) {
      busy = true;
      saved.pos.copy(camera.position);
      saved.quat.copy(camera.quaternion);
      // The screen fills the view when the camera sits in front of it at the distance where the
      // frustum's height equals the screen's height.
      const normal = new THREE.Vector3(0, 0, -1);
      if (b.screenMount) b.screenMount.getWorldDirection(normal).negate();
      else normal.set(0, 0, -b.side);
      const dist = (SCREEN_H / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 0.98;
      const end = b.lookAt.clone().addScaledVector(normal, dist);
      const look = b.lookAt.clone();
      const from = camera.position.clone();
      const t = { v: 0 };
      const startQuat = camera.quaternion.clone();
      const probe = camera.clone();
      probe.position.copy(end);
      probe.lookAt(look);
      const endQuat = probe.quaternion.clone();
      return new Promise((resolve) => {
        gsap.to(t, {
          v: 1,
          duration: ms / 1000,
          ease: 'power3.inOut',
          onUpdate() {
            camera.position.lerpVectors(from, end, t.v);
            camera.quaternion.slerpQuaternions(startQuat, endQuat, t.v);
          },
          onComplete() {
            busy = false;
            resolve();
          },
        });
      });
    },
    back(ms = 600) {
      busy = true;
      const from = camera.position.clone();
      const startQuat = camera.quaternion.clone();
      const t = { v: 0 };
      return new Promise((resolve) => {
        gsap.to(t, {
          v: 1,
          duration: ms / 1000,
          ease: 'power3.inOut',
          onUpdate() {
            camera.position.lerpVectors(from, saved.pos, t.v);
            camera.quaternion.slerpQuaternions(startQuat, saved.quat, t.v);
          },
          onComplete() {
            busy = false;
            resolve();
          },
        });
      });
    },
  };
}
