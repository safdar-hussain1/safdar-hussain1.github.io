import * as THREE from 'three';
import { lifeClock, type Road } from './math';
import type { Building } from './buildings';
import { buildVehicle, type Vehicle } from './vehicles';

// What moves in the city: the Sightline car ahead of the camera, two cars passing the other
// way, the ambulance out of its bay now and then, and each building's own small lights.
export interface Life {
  group: THREE.Group;
  sightline: Vehicle;
  update(t: number, cameraX: number): void;
  setEnabled(on: boolean): void;
  enabled(): boolean;
  /** While the visitor drives the Sightline car, the clock leaves it alone. */
  setDriving(on: boolean): void;
}

export function createLife(scene: THREE.Scene, road: Road, buildings: Building[], accents: { sightline: string }): Life {
  const group = new THREE.Group();
  group.name = 'life';
  const sightline = buildVehicle('sightline', accents.sightline);
  const others = [buildVehicle('car', '#c9d1df'), buildVehicle('car', '#f0b35a')];
  others.forEach((v) => (v.group.rotation.y = Math.PI));
  group.add(sightline.group, ...others.map((v) => v.group));
  scene.add(group);

  const hospital = buildings.find((b) => b.bay);
  let ambulance: Vehicle | null = null;
  if (hospital?.bay) {
    ambulance = buildVehicle('ambulance', '#f2f4f8');
    // It waits in the bay facing the road (local -z); the vehicle is built facing +x.
    ambulance.group.rotation.y = Math.PI / 2;
    hospital.bay.add(ambulance.group);
  }

  let on = true;
  let driving = false;
  let last = 0;
  return {
    group,
    sightline,
    update(t, cameraX) {
      if (!on) return;
      const dt = Math.min(0.1, t - last);
      last = t;
      const life = lifeClock(t, cameraX, road);
      if (!driving) {
        sightline.group.position.set(life.sightline.x, 0, life.sightline.z);
        sightline.group.rotation.y = 0;
      }
      others.forEach((v, i) => v.group.position.set(life.others[i].x, 0, life.others[i].z));
      for (const v of [sightline, ...others]) v.wheels.forEach((w) => (w.rotation.y += dt * 9));
      if (sightline.beacon) (sightline.beacon.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.2 + Math.sin(t * 5) * 0.8;
      if (ambulance) {
        const phase = t % 40;
        const u = life.ambulanceOut ? (phase - 20) / 6 : 0;
        ambulance.group.position.z = -Math.sin(Math.PI * u) * 1.4;
        if (ambulance.beacon) (ambulance.beacon.material as THREE.MeshStandardMaterial).emissiveIntensity = life.ambulanceOut && life.blink ? 3 : 0.3;
      }
      for (const b of buildings) b.update(t, dt);
    },
    setEnabled(v) {
      on = v;
    },
    enabled: () => on,
    setDriving(v) {
      driving = v;
    },
  };
}
