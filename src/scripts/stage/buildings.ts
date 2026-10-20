import * as THREE from 'three';
import { GLOW, box, glass, lit, matte, mirror, shadowed } from './materials';
import { signTexture, windowTexture } from './windows';
import { ROAD_WIDTH, PAVEMENT } from './city';
import type { CityPalette } from './palette';

// One building per project, each built from boxes, cylinders and cones in its own local frame:
// the front wall on the plane z = 0 facing the road at -z, the body behind it. Placed on
// its side of the road, the group is rotated so the front still faces the road.
export type BuildingKind = 'hospital' | 'clinic' | 'gantry' | 'field' | 'studio' | 'towers' | 'hall' | 'depot';

export interface StageEntry {
  slug: string;
  name: string;
  building: BuildingKind;
  accent: string;
  accentInk: { dark: string; light: string };
  status: 'live' | 'scenery';
  tagline: string;
}

export interface Building {
  entry: StageEntry;
  kind: BuildingKind;
  group: THREE.Group;
  side: 1 | -1;
  x: number;
  /** Where the camera stops for this building (world). */
  anchor: THREE.Vector3;
  /** What it looks at (world): the facade screen, or the sign on a scenery stop. */
  lookAt: THREE.Vector3;
  /** Where the facade screen attaches (local to the group); none for scenery. */
  screenMount: THREE.Group | null;
  /** Where the ambulance waits (hospital only). */
  bay: THREE.Group | null;
  /** 0..1: the accent glow of signs and lights while in focus. */
  setFocus(k: number): void;
  /** Ambient animation: blinking, breathing, the game's red and green. */
  update(t: number): void;
  setPalette(p: CityPalette): void;
}

export interface BuildContext {
  rand: () => number;
  palette: CityPalette;
  theme: 'dark' | 'light';
}

/** The front wall's distance from the road's centre line. */
export const FRONT_Z = ROAD_WIDTH / 2 + 0.12 + PAVEMENT + 0.15;

interface Parts {
  group: THREE.Group;
  screenMount: THREE.Group | null;
  bay?: THREE.Group;
  anchorOffset?: THREE.Vector3;
  lookAtLocal?: THREE.Vector3;
  setFocus(k: number): void;
  update(t: number): void;
  setPalette(p: CityPalette): void;
  focusMats?: THREE.MeshStandardMaterial[];
}

type WindowFaces = { faces: THREE.MeshStandardMaterial; wall: THREE.MeshStandardMaterial };

function windowed(ctx: BuildContext, cols: number, rows: number, tintWall?: string): WindowFaces {
  const wall = tintWall ?? ctx.palette.bldg;
  const tex = windowTexture(ctx.rand, { cols, rows, wall });
  const faces = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: ctx.palette.windowIntensity, roughness: 0.9, metalness: 0, flatShading: true });
  return { faces, wall: matte(wall) };
}

// A box with windows on the four walls and a plain roof and floor.
function block(ctx: BuildContext, w: number, h: number, d: number, x: number, z: number, cols = 4, rows = 6, opts: { front?: boolean; wall?: string } = {}): { mesh: THREE.Mesh; mats: WindowFaces } {
  const mats = windowed(ctx, cols, rows, opts.wall);
  const front = opts.front === false ? mats.wall : mats.faces;
  const mesh = box(w, h, d, [mats.faces, mats.faces, mats.wall, mats.wall, mats.wall, front], x, 0, z + d / 2);
  shadowed(mesh);
  return { mesh, mats };
}

// A lit sign with the project's name; the plate is dark with the name in the accent, or the
// accent with the name in white when `inverse`.
function sign(entry: StageEntry, width: number, inverse: boolean, ctx: BuildContext): { group: THREE.Group; mat: THREE.MeshStandardMaterial; glow: THREE.Mesh } {
  const ink = inverse ? '#ffffff' : entry.accentInk.dark;
  const back = inverse ? entry.accent : '#0b1020';
  const { tex, aspect } = signTexture(entry.name, ink, back);
  const h = width / aspect;
  const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: inverse ? 1.1 : 1.3, roughness: 0.6, metalness: 0 });
  const plate = new THREE.Mesh(new THREE.BoxGeometry(width, h, 0.06), [matte(0x1a2240), matte(0x1a2240), matte(0x1a2240), matte(0x1a2240), matte(0x1a2240), mat]);
  const group = new THREE.Group();
  group.add(plate);
  const glowMat = new THREE.MeshBasicMaterial({ color: entry.accent, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(width * 1.6, h * 3), glowMat);
  glow.position.z = 0.045;
  glow.rotation.y = Math.PI;
  group.add(glow);
  void ctx;
  return { group, mat, glow };
}

function beacon(color: string, r = 0.06): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), lit(color, 2));
  m.name = 'beacon';
  return m;
}

function post(h: number, r = 0.04, color: THREE.ColorRepresentation = 0x2a3350): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.2, h, 8), matte(color));
  m.position.y = h / 2;
  m.castShadow = true;
  return m;
}

const BUILDERS: Record<BuildingKind, (entry: StageEntry, ctx: BuildContext) => Parts> = {
  // WardOS: a three-storey hospital with an ambulance bay under a canopy, a cross on the roof
  // and its floor plan on the facade screen.
  hospital(entry, ctx) {
    const group = new THREE.Group();
    const main = block(ctx, 2.3, 2.75, 2.1, 0.5, 0, 5, 8);
    group.add(main.mesh);
    // Entrance band: a lighter strip along the ground floor.
    const band = box(2.3, 0.5, 0.05, lit('#dbe7ff', 0.25, { color: 0x44506e }), 0.5, 0.0, -0.025);
    group.add(band);
    // The bay: a canopy on two posts at the left, the ambulance waits beneath it.
    const canopy = box(1.25, 0.08, 1.15, matte(0x33405e), -1.0, 1.05, -0.55);
    canopy.position.z = 0.6;
    shadowed(canopy);
    group.add(canopy);
    for (const [px, pz] of [[-1.55, 0.1], [-1.55, 1.1], [-0.45, 0.1]] as const) {
      const p = post(1.05, 0.035);
      p.position.set(px, 0.525, pz);
      group.add(p);
    }
    const bayLight = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.03, 0.12), lit('#dfe9ff', 1.2));
    bayLight.position.set(-1.0, 1.0, 0.6);
    group.add(bayLight);
    const bay = new THREE.Group();
    bay.position.set(-1.0, 0, 0.55);
    group.add(bay);
    // The cross on the roof, white with a blue heart, and the name over the entrance.
    const cross = new THREE.Group();
    const crossMat = lit('#eaf2ff', 1.6);
    cross.add(box(0.4, 0.11, 0.1, crossMat, 0, 0.145, 0), box(0.11, 0.4, 0.1, crossMat, 0, 0, 0));
    cross.position.set(0.5, 2.78, 0.9);
    group.add(cross);
    const crossGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), new THREE.MeshBasicMaterial({ color: '#9ecbff', transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
    crossGlow.position.set(0.5, 2.98, 0.95);
    crossGlow.rotation.y = Math.PI;
    group.add(crossGlow);
    const s = sign(entry, 1.1, false, ctx);
    s.group.position.set(0.5, 2.42, -0.06);
    group.add(s.group);
    const screenMount = new THREE.Group();
    screenMount.position.set(0.5, 1.32, -0.035);
    group.add(screenMount);
    return {
      group,
      screenMount,
      bay,
      setFocus(k) {
        (crossGlow.material as THREE.MeshBasicMaterial).opacity = (0.08 + 0.35 * k) * GLOW.scale;
        (s.glow.material as THREE.MeshBasicMaterial).opacity = (0.05 + 0.3 * k) * GLOW.scale;
      },
      update() {},
      setPalette(p) {
        main.mats.faces.emissiveIntensity = p.windowIntensity;
        main.mats.wall.color.set(p.bldg);
      },
    };
  },

  // Nightingale: a low pavilion under a wide roof; its front is a field of small lights that
  // breathe, and the screen stands on the roof like a clinic's board.
  clinic(entry, ctx) {
    const group = new THREE.Group();
    const body = block(ctx, 3.0, 1.4, 2.0, 0.1, 0.0, 6, 3, { front: false });
    group.add(body.mesh);
    const roof = box(3.5, 0.1, 2.5, matte(0x33405e), 0.1, 1.4, -0.25);
    roof.position.z = 1.0;
    shadowed(roof);
    group.add(roof);
    // The glass band and the field of lights.
    const band = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.75, 0.04), glass({ color: 0x9fb0ff, opacity: 0.35 }));
    band.position.set(0.1, 0.72, -0.01);
    group.add(band);
    const dots: THREE.Mesh[] = [];
    const dotGeo = new THREE.BoxGeometry(0.12, 0.12, 0.03);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 11; c++) {
        const warm = (r + c) % 3 !== 0;
        const d = new THREE.Mesh(dotGeo, lit(warm ? '#ffb6d9' : '#c7d2ff', 0.9));
        d.position.set(-1.25 + c * 0.25, 0.45 + r * 0.27, 0.03);
        dots.push(d);
        group.add(d);
      }
    }
    // The board on the roof on two posts, the name on the fascia.
    const screenMount = new THREE.Group();
    screenMount.position.set(0.1, 2.25, 0.25);
    group.add(screenMount);
    for (const px of [-0.85, 1.05]) {
      const p = post(0.65, 0.03);
      p.position.set(px, 1.5 + 0.325, 0.3);
      group.add(p);
    }
    const s = sign(entry, 1.3, false, ctx);
    s.group.position.set(-0.95, 1.31, -0.31);
    s.group.scale.setScalar(0.75);
    group.add(s.group);
    return {
      group,
      screenMount,
      lookAtLocal: new THREE.Vector3(0.1, 2.2, 0.25),
      setFocus(k) {
        (s.glow.material as THREE.MeshBasicMaterial).opacity = (0.05 + 0.25 * k) * GLOW.scale;
      },
      update(t) {
        dots.forEach((d, i) => {
          const m = d.material as THREE.MeshStandardMaterial;
          m.emissiveIntensity = 0.55 + 0.5 * (0.5 + 0.5 * Math.sin(t * 1.3 + i * 0.7));
        });
      },
      setPalette(p) {
        body.mats.faces.emissiveIntensity = p.windowIntensity;
        body.mats.wall.color.set(p.bldg);
      },
    };
  },

  // TrafficLens: a gantry across the road with the camera under its beam and the counting
  // monitor hanging from it, facing the traffic that comes toward the visitor.
  gantry(entry, ctx) {
    const group = new THREE.Group();
    const steel = matte(0x3a4566);
    const nearZ = -(FRONT_Z - ROAD_WIDTH / 2 - 0.2);
    const farZ = -(FRONT_Z + ROAD_WIDTH / 2 + 0.2);
    for (const z of [nearZ, farZ]) {
      const p = post(3.3, 0.07, 0x3a4566);
      p.position.set(0, 1.65, z);
      group.add(p);
      const foot = box(0.4, 0.12, 0.4, steel, 0, 0, z);
      group.add(foot);
    }
    const beam = box(0.16, 0.22, Math.abs(farZ - nearZ) + 0.3, steel, 0, 3.2, (nearZ + farZ) / 2);
    shadowed(beam);
    group.add(beam);
    // The camera: a housing with a hood, looking down the road, a red light while it records.
    const cam = new THREE.Group();
    cam.add(box(0.34, 0.16, 0.16, matte(0x1b2238), 0, 0, 0));
    const lensRing = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.08, 12), matte(0x0b0e18));
    lensRing.rotation.z = Math.PI / 2;
    lensRing.position.set(-0.2, 0.08, 0);
    cam.add(lensRing);
    const rec = beacon('#ff5a5a', 0.025);
    rec.position.set(0.12, 0.2, 0);
    cam.add(rec);
    cam.position.set(0, 2.95, (nearZ + farZ) / 2 - 0.3);
    cam.rotation.z = -0.25;
    group.add(cam);
    const amber = beacon('#ffb347', 0.05);
    amber.position.set(0, 3.38, farZ);
    group.add(amber);
    const cabinet = box(0.45, 0.6, 0.3, matte(0x2a3350), 0.4, 0, nearZ + 0.1);
    shadowed(cabinet);
    group.add(cabinet);
    // The monitor hangs under the beam, facing -x; the name plate sits on the beam above it.
    const screenMount = new THREE.Group();
    screenMount.position.set(-0.1, 2.3, (nearZ + farZ) / 2 + 0.2);
    screenMount.rotation.y = Math.PI / 2;
    group.add(screenMount);
    const s = sign(entry, 1.4, true, ctx);
    s.group.position.set(-0.12, 3.2, (nearZ + farZ) / 2 + 0.2);
    s.group.rotation.y = Math.PI / 2;
    s.group.scale.setScalar(0.85);
    group.add(s.group);
    return {
      group,
      screenMount,
      anchorOffset: new THREE.Vector3(-7.0, 1.8, 0),
      lookAtLocal: new THREE.Vector3(-0.1, 2.25, (nearZ + farZ) / 2 + 0.2),
      setFocus(k) {
        (s.glow.material as THREE.MeshBasicMaterial).opacity = (0.05 + 0.25 * k) * GLOW.scale;
      },
      update(t) {
        (rec.material as THREE.MeshStandardMaterial).emissiveIntensity = Math.floor(t * 2) % 2 === 0 ? 2.2 : 0.2;
        (amber.material as THREE.MeshStandardMaterial).emissiveIntensity = 1 + Math.sin(t * 6) * 0.9;
      },
      setPalette() {},
    };
  },

  // Red Light, Green Light: a floodlit pitch with a start and a finish line, the signal pole
  // whose lamps alternate, four runners who creep on green and freeze on red, and the
  // scoreboard across the far end.
  field(entry, ctx) {
    const group = new THREE.Group();
    const pitch = box(3.4, 0.06, 2.5, matte('#1d5b34', { roughness: 1 }), 0, 0, 1.25);
    pitch.receiveShadow = true;
    group.add(pitch);
    const line = lit('#f4f4f4', 0.35, { color: 0xbdbdbd });
    group.add(box(3.0, 0.012, 0.06, line, 0, 0.06, 0.3), box(3.0, 0.012, 0.06, line, 0, 0.06, 2.2));
    // Fence posts along three sides.
    for (let i = 0; i <= 8; i++) {
      const x = -1.7 + i * 0.425;
      const p = post(0.4, 0.015, 0x6b7489);
      p.position.set(x, 0.2, 2.48);
      group.add(p);
    }
    for (const x of [-1.7, 1.7]) {
      for (let i = 0; i <= 5; i++) {
        const p = post(0.4, 0.015, 0x6b7489);
        p.position.set(x, 0.2, 0.05 + i * 0.485);
        group.add(p);
      }
    }
    // The signal pole with the two lamps and a small hood.
    const pole = post(1.9, 0.03, 0x2a3350);
    pole.position.set(1.5, 0.95, 2.1);
    group.add(pole);
    const red = beacon('#ff4d4d', 0.07);
    red.position.set(1.5, 1.95, 2.1);
    const green = beacon('#4ade80', 0.07);
    green.position.set(1.5, 1.72, 2.1);
    group.add(red, green, box(0.2, 0.05, 0.2, matte(0x2a3350), 1.5, 2.03, 2.1));
    // Runners: capsules in four tints, waiting on the start line.
    const runners: THREE.Mesh[] = [];
    const starts: number[] = [];
    [['#ffd166', -0.9], ['#ef476f', -0.3], ['#06d6a0', 0.3], ['#118ab2', 0.9]].forEach(([c, x]) => {
      const r = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.16, 4, 8), matte(c as string));
      r.position.set(x as number, 0.21, 0.5);
      r.castShadow = true;
      runners.push(r);
      starts.push(0.5);
      group.add(r);
    });
    // Floodlights: two masts with lit heads.
    for (const x of [-1.6, 1.6]) {
      const mast = post(2.4, 0.03, 0x2a3350);
      mast.position.set(x, 1.2, 0.0);
      group.add(mast);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.06), lit('#f1f5ff', 1.2));
      head.position.set(x, 2.4, 0.08);
      head.rotation.x = 0.5;
      group.add(head);
    }
    // The scoreboard at the far end, on two posts, the name on its top edge.
    for (const px of [-0.95, 0.95]) {
      const p = post(0.85, 0.03);
      p.position.set(px, 0.425, 2.42);
      group.add(p);
    }
    const screenMount = new THREE.Group();
    screenMount.position.set(0, 1.5, 2.4);
    group.add(screenMount);
    const s = sign(entry, 1.6, true, ctx);
    s.group.position.set(0, 2.28, 2.4);
    s.group.scale.setScalar(0.8);
    group.add(s.group);
    let phase = 0;
    return {
      group,
      screenMount,
      anchorOffset: new THREE.Vector3(-3.0, 1.9, 0.6),
      lookAtLocal: new THREE.Vector3(0, 1.35, 2.4),
      setFocus(k) {
        (s.glow.material as THREE.MeshBasicMaterial).opacity = (0.05 + 0.25 * k) * GLOW.scale;
      },
      update(t) {
        const cycle = t % 9;
        const greenOn = cycle < 5;
        (green.material as THREE.MeshStandardMaterial).emissiveIntensity = greenOn ? 2.4 : 0.15;
        (red.material as THREE.MeshStandardMaterial).emissiveIntensity = greenOn ? 0.15 : 2.4;
        if (greenOn) {
          runners.forEach((r, i) => {
            r.position.z = Math.min(2.05, r.position.z + 0.004 * (1 + ((i * 7 + Math.floor(t)) % 3)));
            r.position.y = 0.21 + Math.abs(Math.sin(t * 9 + i)) * 0.03;
          });
        } else if (cycle > 8.5 && phase !== Math.floor(t / 9)) {
          phase = Math.floor(t / 9);
          runners.forEach((r, i) => (r.position.z = starts[i]));
        }
      },
      setPalette() {},
    };
  },

  // Carmine: a two-storey studio with a lit sign on the roof, a mirror beside the door, an
  // awning, and the screen as its shop window.
  studio(entry, ctx) {
    const group = new THREE.Group();
    const body = block(ctx, 2.7, 2.05, 1.9, 0.15, 0, 5, 5, { front: false });
    group.add(body.mesh);
    const mirrorPanel = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.55, 0.04), mirror());
    mirrorPanel.position.set(-0.85, 0.95, -0.01);
    group.add(mirrorPanel);
    const frame = box(0.7, 1.63, 0.03, matte(0x1a2240), -0.85, 0.135, -0.005);
    group.add(frame);
    const awning = box(0.95, 0.05, 0.5, matte(entry.accent), -0.85, 1.78, -0.25);
    awning.rotation.x = -0.18;
    shadowed(awning, true, false);
    group.add(awning);
    const doorLight = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.03, 0.08), lit('#ffd9c2', 1.2));
    doorLight.position.set(-0.85, 1.76, -0.08);
    group.add(doorLight);
    // The lit sign on the roof, with its own soft halo.
    const s = sign(entry, 2.0, true, ctx);
    s.group.position.set(0.3, 2.42, 0.5);
    s.group.scale.setScalar(1.05);
    group.add(s.group);
    for (const px of [-0.4, 1.0]) {
      const p = post(0.3, 0.02);
      p.position.set(px, 2.05 + 0.15, 0.55);
      group.add(p);
    }
    const screenMount = new THREE.Group();
    screenMount.position.set(0.55, 1.1, -0.03);
    group.add(screenMount);
    return {
      group,
      screenMount,
      setFocus(k) {
        (s.glow.material as THREE.MeshBasicMaterial).opacity = (0.12 + 0.45 * k) * GLOW.scale;
        s.mat.emissiveIntensity = 1.0 + 0.5 * k;
      },
      update() {},
      setPalette(p) {
        body.mats.faces.emissiveIntensity = p.windowIntensity;
        body.mats.wall.color.set(p.bldg);
      },
    };
  },

  // HomeCast: three towers of lit windows on a podium, beacons on their roofs, the sales
  // board standing at the front of the podium.
  towers(entry, ctx) {
    const group = new THREE.Group();
    const podium = box(3.3, 0.5, 2.5, matte(ctx.palette.bldg), 0, 0, 1.25);
    shadowed(podium);
    group.add(podium);
    const towers: Array<ReturnType<typeof block>> = [];
    const beacons: THREE.Mesh[] = [];
    for (const [x, z, w, h] of [
      [-1.05, 1.35, 0.85, 3.6],
      [0.05, 1.7, 0.95, 4.7],
      [1.1, 1.2, 0.8, 4.1],
    ] as const) {
      const t = block(ctx, w, h, w, x, z - w / 2, 3, Math.round(h * 2.6));
      t.mesh.position.y = 0.5 + h / 2;
      group.add(t.mesh);
      towers.push(t);
      const b = beacon('#ff6b6b', 0.05);
      b.position.set(x, 0.5 + h + 0.07, z);
      beacons.push(b);
      group.add(b);
    }
    // The board at the front edge of the podium, the name on the podium's face.
    const screenMount = new THREE.Group();
    screenMount.position.set(0.3, 1.25, 0.12);
    group.add(screenMount);
    for (const px of [-0.6, 1.2]) {
      const p = post(0.7, 0.025);
      p.position.set(px, 0.5 + 0.35, 0.14);
      group.add(p);
    }
    const s = sign(entry, 1.2, false, ctx);
    s.group.position.set(-0.9, 0.27, -0.06);
    s.group.scale.setScalar(0.7);
    group.add(s.group);
    return {
      group,
      screenMount,
      lookAtLocal: new THREE.Vector3(0.3, 1.25, 0.12),
      setFocus(k) {
        (s.glow.material as THREE.MeshBasicMaterial).opacity = (0.05 + 0.25 * k) * GLOW.scale;
      },
      update(t) {
        beacons.forEach((b, i) => ((b.material as THREE.MeshStandardMaterial).emissiveIntensity = Math.floor(t * 1.2 + i * 0.4) % 2 === 0 ? 2.2 : 0.2));
      },
      setPalette(p) {
        towers.forEach((tw) => {
          tw.mats.faces.emissiveIntensity = p.windowIntensity;
          tw.mats.wall.color.set(p.bldg);
        });
        (podium.material as THREE.MeshStandardMaterial).color.set(p.bldg);
      },
    };
  },

  // Wavelength: a music hall under a curved roof, with a row of lights along its front that
  // ripple like a waveform; scenery until the project is live.
  hall(entry, ctx) {
    const group = new THREE.Group();
    const body = block(ctx, 3.0, 1.5, 2.2, 0, 0, 6, 3, { front: false });
    group.add(body.mesh);
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 3.0, 28, 1, false, 0, Math.PI), matte(0x33405e));
    roof.rotation.z = Math.PI / 2;
    roof.rotation.y = Math.PI / 2;
    roof.position.set(0, 1.5, 1.1);
    shadowed(roof);
    group.add(roof);
    const bars: THREE.Mesh[] = [];
    const barGeo = new THREE.BoxGeometry(0.1, 1, 0.05);
    for (let i = 0; i < 13; i++) {
      const b = new THREE.Mesh(barGeo, lit(entry.accentInk.dark, 1.3));
      b.position.set(-1.2 + i * 0.2, 0.75, -0.03);
      b.scale.y = 0.3;
      bars.push(b);
      group.add(b);
    }
    const s = sign(entry, 1.6, true, ctx);
    s.group.position.set(0, 1.62, -0.22);
    s.group.scale.setScalar(0.9);
    group.add(s.group);
    const doors = box(0.8, 0.6, 0.03, lit('#ffe3c4', 0.35, { color: 0x5a4a3a }), -0.9, 0, -0.015);
    group.add(doors);
    return {
      group,
      screenMount: null,
      lookAtLocal: new THREE.Vector3(0, 1.2, 0),
      setFocus(k) {
        (s.glow.material as THREE.MeshBasicMaterial).opacity = (0.1 + 0.3 * k) * GLOW.scale;
      },
      update(t) {
        bars.forEach((b, i) => {
          const v = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(t * 2.2 - i * 0.55)) * (0.6 + 0.4 * Math.sin(t * 0.7 + i));
          b.scale.y = v;
          b.position.y = 0.45 + v / 2;
        });
      },
      setPalette(p) {
        body.mats.faces.emissiveIntensity = p.windowIntensity;
        body.mats.wall.color.set(p.bldg);
      },
    };
  },

  // Sightline: the car's depot, a roll-up door lit from inside, a bollard and the name
  // above the door; scenery until the project is live, the car itself drives the road.
  depot(entry, ctx) {
    const group = new THREE.Group();
    const body = block(ctx, 2.7, 1.75, 2.3, 0.1, 0, 5, 3, { front: false });
    group.add(body.mesh);
    const door = box(1.5, 1.3, 0.04, matte(0x1b2238), 0.1, 0, -0.01);
    group.add(door);
    for (let i = 1; i < 6; i++) {
      const rib = box(1.5, 0.01, 0.02, matte(0x2a3350), 0.1, i * 0.22, -0.03);
      group.add(rib);
    }
    const slit = box(1.5, 0.05, 0.03, lit(entry.accentInk.dark, 2.2), 0.1, 0.02, -0.03);
    group.add(slit);
    const glowMat = new THREE.MeshBasicMaterial({ color: entry.accent, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false });
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.9), glowMat);
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(0.1, 0.02, -0.4);
    group.add(glow);
    const bollard = post(0.45, 0.04, 0x4b5569);
    bollard.position.set(1.4, 0.225, -0.3);
    group.add(bollard);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 0.1), lit('#ffd9a0', 1.3));
    lamp.position.set(0.1, 1.48, -0.06);
    group.add(lamp);
    const s = sign(entry, 1.3, false, ctx);
    s.group.position.set(0.1, 1.55, -0.06);
    s.group.scale.setScalar(0.8);
    group.add(s.group);
    const sensor = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.12, 10), matte(0x2a3350));
    sensor.position.set(-1.0, 1.81, 0.4);
    group.add(sensor);
    return {
      group,
      screenMount: null,
      lookAtLocal: new THREE.Vector3(0.1, 1.0, 0),
      setFocus(k) {
        glowMat.opacity = (0.15 + 0.3 * k) * GLOW.scale;
        (s.glow.material as THREE.MeshBasicMaterial).opacity = (0.05 + 0.25 * k) * GLOW.scale;
      },
      update(t) {
        glowMat.opacity = Math.max(glowMat.opacity, 0.15 * GLOW.scale) + Math.sin(t * 1.5) * 0.03 * GLOW.scale;
      },
      setPalette(p) {
        body.mats.faces.emissiveIntensity = p.windowIntensity;
        body.mats.wall.color.set(p.bldg);
      },
    };
  },
};

export function buildBuilding(entry: StageEntry, x: number, side: 1 | -1, ctx: BuildContext): Building {
  const parts = BUILDERS[entry.building](entry, ctx);
  const group = parts.group;
  group.name = `building:${entry.slug}`;
  const isGantry = entry.building === 'gantry';
  group.position.set(x, 0, isGantry ? side * FRONT_Z : side * FRONT_Z);
  if (side === -1) group.rotation.y = Math.PI;
  group.updateMatrixWorld(true);

  const lookLocal = parts.lookAtLocal ?? (parts.screenMount ? parts.screenMount.position.clone() : new THREE.Vector3(0, 1.2, 0));
  const lookAt = group.localToWorld(lookLocal.clone());
  const offset = parts.anchorOffset ?? new THREE.Vector3(-4.8, 1.9, -(FRONT_Z + 1.9));
  // The anchor is given relative to the building's own front, in world axes: before it along
  // the road, on the opposite kerb at eye height.
  const anchor = new THREE.Vector3(x + offset.x, offset.y, side === 1 ? offset.z + FRONT_Z : -(offset.z + FRONT_Z));
  if (isGantry) anchor.set(x + offset.x, offset.y, side === 1 ? 0.3 : -0.3);
  if (entry.building === 'field') anchor.set(x + offset.x, offset.y, side === 1 ? -0.6 : 0.6);

  return {
    entry,
    kind: entry.building,
    group,
    side,
    x,
    anchor,
    lookAt,
    screenMount: parts.screenMount,
    bay: parts.bay ?? null,
    setFocus: parts.setFocus,
    update: parts.update,
    setPalette: parts.setPalette,
  };
}
