import * as THREE from 'three';
import gsap from 'gsap';
import type { CityPalette } from './palette';

// A thick biconvex lens of glass: real refraction with a hint of dispersion, a soft rim, and a
// focus pull on load from blurred to clear.
export interface LensHandle {
  mesh: THREE.Mesh<THREE.LatheGeometry, THREE.MeshPhysicalMaterial>;
  group: THREE.Group;
  update(now: number, pointer: { x: number; y: number }): void;
  focusPull(): Promise<void>;
  /** Straight to the pulled focus, for stills. */
  sharp(): void;
  setRadius(r: number): void;
  setPalette(p: CityPalette): void;
}

export function lensProfile(radius = 1.0, centre = 0.3, edge = 0.03, steps = 48): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [];
  for (let k = 0; k <= steps; k++) {
    const r = (radius * k) / steps;
    pts.push(new THREE.Vector2(r, centre - ((centre - edge) * r * r) / (radius * radius)));
  }
  pts.push(new THREE.Vector2(radius, -edge));
  for (let k = steps; k >= 0; k--) {
    const r = (radius * k) / steps;
    pts.push(new THREE.Vector2(r, -(centre - ((centre - edge) * r * r) / (radius * radius))));
  }
  return pts;
}

export function createLens(scene: THREE.Scene, palette: CityPalette): LensHandle {
  const geometry = new THREE.LatheGeometry(lensProfile(), 192);
  geometry.rotateX(Math.PI / 2);
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    transmission: 1,
    thickness: 4.0,
    ior: 2.0,
    dispersion: 0.6,
    roughness: 0.6,
    metalness: 0,
    clearcoat: 0.5,
    clearcoatRoughness: 0.06,
    specularIntensity: 1,
    envMapIntensity: palette.lensEnv * 1.5,
    attenuationColor: new THREE.Color(0xe4ecff),
    attenuationDistance: 10,
    iridescence: 0.12,
    iridescenceIOR: 1.3,
  });
  const mesh = new THREE.Mesh(geometry, material);
  const group = new THREE.Group();
  group.add(mesh);
  scene.add(group);

  const tilt = { x: 0, y: 0 };
  let radius = 0.55;
  let pulled = 0.86;
  return {
    mesh,
    group,
    update(now, pointer) {
      tilt.x += (pointer.y * -0.28 - tilt.x) * 0.05;
      tilt.y += (pointer.x * 0.38 - tilt.y) * 0.05;
      mesh.rotation.set(tilt.x + Math.sin(now / 1900) * 0.03, tilt.y + Math.sin(now / 2700) * 0.04, 0);
      mesh.position.y = Math.sin(now / 2300) * 0.02 * radius;
      group.scale.setScalar(radius * pulled);
    },
    focusPull() {
      return new Promise((resolve) => {
        const s = { v: pulled };
        gsap.to(material, { roughness: 0.03, duration: 1.3, ease: 'power3.out' });
        gsap.to(s, { v: 1, duration: 1.3, ease: 'power3.out', onUpdate: () => (pulled = s.v), onComplete: () => resolve() });
      });
    },
    sharp() {
      material.roughness = 0.03;
      pulled = 1;
    },
    setRadius(r) {
      radius = r;
      group.scale.setScalar(radius * pulled);
    },
    setPalette(p) {
      material.envMapIntensity = p.lensEnv * 1.5;
      material.attenuationColor.set(p.lensEnv < 0.8 ? 0xcfe0ff : 0xe4ecff);
      material.attenuationDistance = p.lensEnv < 0.8 ? 4 : 10;
    },
  };
}
