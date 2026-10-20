import * as THREE from 'three';
import { PLINTH_RADIUS, ROAD_WIDTH, PAVEMENT, type CityHandle } from './city';
import { matte, lit } from './materials';
import { windowTexture } from './windows';
import type { CityPalette } from './palette';

// Everything that is not a project: trees along the pavements and the far blocks whose
// windows make the skyline behind the stops. All of it inside the plinth, none of it on a stop.
export interface SceneryHandle {
  group: THREE.Group;
  blocks: THREE.Mesh[];
  setPalette(p: CityPalette): void;
}

const STOP_XS = [-14, -10, -6, -2, 2, 6, 10, 14];

function nearAStop(x: number, z: number): boolean {
  const lane = ROAD_WIDTH / 2 + PAVEMENT + 0.2;
  if (Math.abs(z) < lane) return true;
  return STOP_XS.some((sx) => Math.abs(x - sx) < 2.2 && Math.abs(z) < 5.4);
}

export function addScenery(city: CityHandle, rand: () => number, palette: CityPalette): SceneryHandle {
  const group = new THREE.Group();
  group.name = 'scenery';
  const treeMat = matte(palette.tree);
  const trunkMat = matte(0x3b2a22);

  // Trees: a cone on a short trunk, in two sizes, scattered where no stop stands.
  const cone = new THREE.ConeGeometry(0.42, 1.1, 7);
  const trunk = new THREE.CylinderGeometry(0.06, 0.08, 0.35, 5);
  const trees = new THREE.InstancedMesh(cone, treeMat, 40);
  const trunks = new THREE.InstancedMesh(trunk, trunkMat, 40);
  const m = new THREE.Matrix4();
  let count = 0;
  let guard = 0;
  while (count < 40 && guard++ < 600) {
    const r = 3.2 + rand() * (PLINTH_RADIUS - 4.2);
    const a = rand() * Math.PI * 2;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (nearAStop(x, z)) continue;
    const s = 0.7 + rand() * 0.8;
    m.compose(new THREE.Vector3(x, 0.35 + 0.55 * s, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 6.28), new THREE.Vector3(s, s, s));
    trees.setMatrixAt(count, m);
    m.compose(new THREE.Vector3(x, 0.175 * s, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s));
    trunks.setMatrixAt(count, m);
    count += 1;
  }
  trees.count = count;
  trunks.count = count;
  trees.castShadow = true;
  group.add(trees, trunks);

  // Far blocks: nine towers of lit windows behind the stops, never on the road.
  const blocks: THREE.Mesh[] = [];
  const wallMat = matte(palette.bldg);
  const spots: Array<[number, number, number, number]> = [
    [-9, 7.5, 1.6, 3.2],
    [-3.5, 8.5, 2.0, 4.6],
    [3, 7.8, 1.5, 3.8],
    [9.5, 8.2, 1.8, 3.0],
    [-13, -7.5, 1.6, 2.8],
    [-6, -8.5, 2.2, 4.2],
    [1, -8, 1.5, 3.4],
    [8, -8.5, 1.9, 4.9],
    [13.5, -7, 1.4, 2.6],
  ];
  for (const [x, z, w, h] of spots) {
    const tex = windowTexture(rand, { cols: Math.max(3, Math.round(w * 3)), rows: Math.max(6, Math.round(h * 3)), wall: palette.bldg });
    const faces = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: palette.windowIntensity, roughness: 0.9, metalness: 0, flatShading: true });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * 0.9), [faces, faces, wallMat, wallMat, faces, faces]);
    mesh.position.set(x, h / 2, z);
    mesh.rotation.y = (rand() - 0.5) * 0.5;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    blocks.push(mesh);
    // A roof light on the taller ones.
    if (h > 4) {
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), lit('#ff6b6b', 1.5));
      beacon.position.set(x, h + 0.08, z);
      beacon.name = 'beacon';
      group.add(beacon);
    }
  }

  city.group.add(group);
  return {
    group,
    blocks,
    setPalette(p) {
      treeMat.color.set(p.tree);
      wallMat.color.set(p.bldg);
      for (const b of blocks) {
        const mats = b.material as THREE.MeshStandardMaterial[];
        mats[0].emissiveIntensity = p.windowIntensity;
      }
    },
  };
}
