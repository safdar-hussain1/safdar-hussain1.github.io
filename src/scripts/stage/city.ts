import * as THREE from 'three';
import type { CityPalette } from './palette';
import { box, matte, lit } from './materials';
import { glowTexture } from './windows';
import type { Road } from './math';

// The city's ground: a round plinth with a visible edge, the main road along x with its
// dashes, kerbs and pavements, the street lamps, and the lights of the night.
export const PLINTH_RADIUS = 18.5;
export const ROAD: Road = { xMin: -17, xMax: 17, laneZ: [0.5, -0.55] };
export const ROAD_WIDTH = 2.3;
export const PAVEMENT = 1.1;

export interface CityHandle {
  group: THREE.Group;
  road: Road;
  lamps: THREE.InstancedMesh;
  lampHeads: THREE.InstancedMesh;
  moon: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  walkLight: THREE.PointLight;
  accentLight: THREE.SpotLight;
  /** How strong the accent spot may be under this palette. */
  accentScale: number;
  setPalette(p: CityPalette): void;
  setShadows(on: boolean): void;
}

export function buildCity(scene: THREE.Scene, palette: CityPalette): CityHandle {
  const group = new THREE.Group();
  group.name = 'city';

  const plinthMat = matte(palette.plinth);
  const topMat = matte(palette.top);
  const roadMat = matte(palette.road, { roughness: 0.98 });
  const kerbMat = matte(palette.kerb);
  const dashMat = lit('#f3e2b0', 0.5, { color: 0x6b6450 });

  // The plinth: a thick disc; its side is darker than its top so the edge reads.
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(PLINTH_RADIUS, PLINTH_RADIUS, 1.2, 96, 1, false), [plinthMat, topMat, plinthMat]);
  plinth.position.y = -0.6;
  plinth.receiveShadow = true;
  group.add(plinth);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(PLINTH_RADIUS, 0.06, 8, 160), kerbMat);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.0;
  group.add(rim);

  // The road along x, flush with the top, with kerbs and pavements either side.
  const length = ROAD.xMax - ROAD.xMin;
  const road = box(length, 0.02, ROAD_WIDTH, roadMat, 0, 0, 0);
  road.receiveShadow = true;
  group.add(road);
  for (const side of [1, -1]) {
    const kerb = box(length, 0.1, 0.12, kerbMat, 0, 0, side * (ROAD_WIDTH / 2 + 0.06));
    kerb.receiveShadow = true;
    group.add(kerb);
    const pavement = box(length, 0.08, PAVEMENT, topMat, 0, 0, side * (ROAD_WIDTH / 2 + 0.12 + PAVEMENT / 2));
    pavement.receiveShadow = true;
    group.add(pavement);
  }
  const dashes = Math.floor(length / 1.4);
  const dash = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 0.012, 0.07), dashMat, dashes);
  const m = new THREE.Matrix4();
  for (let i = 0; i < dashes; i++) {
    m.makeTranslation(ROAD.xMin + 0.7 + i * 1.4, 0.026, 0);
    dash.setMatrixAt(i, m);
  }
  group.add(dash);

  // Street lamps every four units, between the stops (x = -12, -8, … 16) and alternating sides,
  // so none stands before a facade: a slim post, an arm over the road and a lit head with a halo.
  const lampCount = 8;
  const postGeo = new THREE.CylinderGeometry(0.035, 0.05, 2.3, 6);
  const lamps = new THREE.InstancedMesh(postGeo, matte(0x2a3350), lampCount);
  const lampHeadMat = lit('#ffd9a0', palette.lampIntensity, { color: 0x3b3326 });
  const lampHeads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.075, 10, 8), lampHeadMat, lampCount);
  const haloMat = new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffd9a0', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
  const halos = new THREE.Group();
  const armGeo = new THREE.BoxGeometry(0.04, 0.04, 0.5);
  const arms = new THREE.InstancedMesh(armGeo, matte(0x2a3350), lampCount);
  for (let i = 0; i < lampCount; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const x = -12 + i * 4;
    const z = side * (ROAD_WIDTH / 2 + 0.35);
    m.makeTranslation(x, 1.15 + 0.08, z);
    lamps.setMatrixAt(i, m);
    m.makeTranslation(x, 2.36, z - side * 0.22);
    arms.setMatrixAt(i, m);
    m.makeTranslation(x, 2.3, z - side * 0.45);
    lampHeads.setMatrixAt(i, m);
    const halo = new THREE.Sprite(haloMat);
    halo.position.set(x, 2.3, z - side * 0.45);
    halo.scale.setScalar(0.9);
    halos.add(halo);
  }
  lamps.castShadow = true;
  group.add(lamps, arms, lampHeads, halos);

  // Light: a moon as the key, a hemisphere fill, a warm pool that walks with the camera, and
  // the accent spot that lights the building in focus.
  const moon = new THREE.DirectionalLight(palette.moonColor, palette.moonIntensity);
  moon.position.set(-14, 22, 12);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.camera.left = -20;
  moon.shadow.camera.right = 20;
  moon.shadow.camera.top = 20;
  moon.shadow.camera.bottom = -20;
  moon.shadow.camera.near = 1;
  moon.shadow.camera.far = 70;
  moon.shadow.bias = -0.0008;
  moon.shadow.normalBias = 0.02;
  moon.shadow.radius = 4;
  const hemi = new THREE.HemisphereLight(palette.hemiSky, palette.hemiGround, palette.hemiIntensity);
  const walkLight = new THREE.PointLight('#ffd2a0', palette.lampIntensity * 4, 7, 1.6);
  walkLight.position.set(0, 2.2, 0);
  const accentLight = new THREE.SpotLight('#ffffff', 0, 12, Math.PI / 5, 0.6, 1.2);
  accentLight.position.set(0, 4.5, 0);
  accentLight.target.position.set(0, 1, 2);
  group.add(moon, moon.target, hemi, walkLight, accentLight, accentLight.target);

  scene.add(group);
  scene.fog = new THREE.Fog(palette.fogColor, palette.fog[0], palette.fog[1]);

  const handle: CityHandle = {
    group,
    road: ROAD,
    lamps,
    lampHeads,
    moon,
    hemi,
    walkLight,
    accentLight,
    accentScale: palette.accent,
    setPalette(p) {
      handle.accentScale = p.accent;
      plinthMat.color.set(p.plinth);
      topMat.color.set(p.top);
      roadMat.color.set(p.road);
      kerbMat.color.set(p.kerb);
      lampHeadMat.emissiveIntensity = p.lampIntensity;
      haloMat.opacity = p.lampIntensity >= 1 ? 0.55 * p.glow : 0;
      moon.color.set(p.moonColor);
      moon.intensity = p.moonIntensity;
      hemi.color.set(p.hemiSky);
      hemi.groundColor.set(p.hemiGround);
      hemi.intensity = p.hemiIntensity;
      walkLight.intensity = p.lampIntensity * 4;
      const fog = scene.fog as THREE.Fog;
      fog.color.set(p.fogColor);
      fog.near = p.fog[0];
      fog.far = p.fog[1];
    },
    setShadows(on) {
      moon.castShadow = on;
    },
  };
  haloMat.opacity = palette.lampIntensity >= 1 ? 0.55 * palette.glow : 0;
  return handle;
}
