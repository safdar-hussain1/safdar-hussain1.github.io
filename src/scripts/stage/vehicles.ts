import * as THREE from 'three';
import { box, lit, matte } from './materials';

// Small cars from boxes and cylinders, built facing +x: a body, a cabin, four wheels, lamps
// front and back. The Sightline car is lower and carries its camera; the ambulance is a van
// with a stripe and a beacon.
export type VehicleKind = 'car' | 'sightline' | 'ambulance';

export interface Vehicle {
  group: THREE.Group;
  beacon: THREE.Mesh | null;
  wheels: THREE.Mesh[];
}

export function buildVehicle(kind: VehicleKind, color: string): Vehicle {
  const group = new THREE.Group();
  const paint = matte(color, { roughness: 0.55 });
  const dark = matte(0x151a2a);
  const wheels: THREE.Mesh[] = [];
  let beaconMesh: THREE.Mesh | null = null;
  const wheelGeo = new THREE.CylinderGeometry(0.085, 0.085, 0.07, 10);

  if (kind === 'ambulance') {
    const body = box(0.95, 0.42, 0.46, matte('#f2f4f8', { roughness: 0.6 }), 0, 0.09, 0);
    body.castShadow = true;
    group.add(body);
    group.add(box(0.95, 0.07, 0.47, matte('#d7263d'), 0, 0.22, 0));
    group.add(box(0.3, 0.2, 0.47, dark, 0.3, 0.3, 0));
    beaconMesh = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.2), lit('#4f8bff', 2));
    beaconMesh.position.set(-0.05, 0.54, 0);
    group.add(beaconMesh);
  } else if (kind === 'sightline') {
    const body = box(1.0, 0.16, 0.44, paint, 0, 0.1, 0);
    body.castShadow = true;
    group.add(body);
    const cabin = box(0.5, 0.14, 0.38, dark, -0.05, 0.26, 0);
    group.add(cabin);
    const sensor = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.07, 10), matte(0x2a3350));
    sensor.position.set(-0.02, 0.435, 0);
    group.add(sensor);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.012, 6, 16), lit(color, 1.8));
    ring.rotation.x = Math.PI / 2;
    ring.position.set(-0.02, 0.44, 0);
    group.add(ring);
    beaconMesh = ring;
  } else {
    const body = box(0.9, 0.2, 0.42, paint, 0, 0.1, 0);
    body.castShadow = true;
    group.add(body);
    group.add(box(0.46, 0.17, 0.38, dark, -0.06, 0.3, 0));
  }

  for (const [x, z] of [
    [0.3, 0.22],
    [0.3, -0.22],
    [-0.3, 0.22],
    [-0.3, -0.22],
  ]) {
    const w = new THREE.Mesh(wheelGeo, dark);
    w.rotation.x = Math.PI / 2;
    w.position.set(x, 0.085, z);
    wheels.push(w);
    group.add(w);
  }
  const head = lit('#fff6d6', 2.2);
  const tail = lit('#ff3b3b', 1.6);
  const front = kind === 'ambulance' ? 0.47 : kind === 'sightline' ? 0.5 : 0.45;
  for (const z of [0.15, -0.15]) {
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 5), head);
    h.position.set(front, 0.2, z);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.04, 0.08), tail);
    t.position.set(-front, 0.2, z);
    group.add(h, t);
  }
  return { group, beacon: beaconMesh, wheels };
}
