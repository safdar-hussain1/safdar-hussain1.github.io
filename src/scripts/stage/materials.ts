import * as THREE from 'three';

// The city is matte and low-poly: one material family, flat shaded, no metal, no gloss, so
// everything reads as a model on a table. Glass and mirrors are the exceptions and say so.
export function matte(color: THREE.ColorRepresentation, extra: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0, flatShading: true, ...extra });
}

// One material per plain colour, for the many posts, plates and trims that are never animated
// or recoloured; fewer materials means fewer state changes per frame.
const plain = new Map<string, THREE.MeshStandardMaterial>();
export function matteShared(color: THREE.ColorRepresentation): THREE.MeshStandardMaterial {
  const key = new THREE.Color(color).getHexString();
  let m = plain.get(key);
  if (!m) {
    m = matte(color);
    plain.set(key, m);
  }
  return m;
}

export function lit(color: THREE.ColorRepresentation, intensity = 1.4, extra: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: 0x111111, emissive: color, emissiveIntensity: intensity, roughness: 0.6, metalness: 0, ...extra });
}

export function glass(extra: Partial<THREE.MeshPhysicalMaterialParameters> = {}): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({ color: 0x8fb3ff, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.55, ...extra });
}

export function mirror(extra: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: 0xcfd8ea, roughness: 0.12, metalness: 0.95, ...extra });
}

export function box(w: number, h: number, d: number, material: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y + h / 2, z);
  return m;
}

export function shadowed(mesh: THREE.Mesh, cast = true, receive = true): THREE.Mesh {
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  return mesh;
}

// The one dial every glow reads, set from the palette when the theme changes.
export const GLOW = { scale: 1 };

// A box whose faces share materials in runs draws once per run instead of once per face:
// `faces` lists one material index per face in the box's order (+x, -x, +y, -y, +z, -z).
export function groupedBox(w: number, h: number, d: number, faces: number[], materials: THREE.Material[], x = 0, y = 0, z = 0): THREE.Mesh {
  const geo = new THREE.BoxGeometry(w, h, d);
  geo.clearGroups();
  let start = 0;
  for (let f = 0; f < 6; ) {
    let g = f;
    while (g < 6 && faces[g] === faces[f]) g += 1;
    geo.addGroup(start, (g - f) * 6, faces[f]);
    start += (g - f) * 6;
    f = g;
  }
  const m = new THREE.Mesh(geo, materials);
  m.position.set(x, y + h / 2, z);
  return m;
}
