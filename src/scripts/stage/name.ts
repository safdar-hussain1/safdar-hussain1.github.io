import * as THREE from 'three';

// The name, drawn once into a canvas sized to its longest line and set on a plane behind the
// lens. The plane is opaque with an alpha test so the glass's transmission pass can see and
// refract it; alpha-to-coverage keeps the edges smooth under multisampling.
export interface NameArt {
  tex: THREE.CanvasTexture;
  aspect: number;
}

const FONT_PX = 300;
const LINE_GAP = 1.08;
const PAD = 40;

export function nameTexture(lines: string[], ink: string, family = 'Archivo Variable'): NameArt {
  const canvas = document.createElement('canvas');
  const c = canvas.getContext('2d')!;
  const font = `260 ${FONT_PX}px "${family}", "Archivo", system-ui, sans-serif`;
  const setFont = (ctx: CanvasRenderingContext2D) => {
    ctx.font = font;
    const x = ctx as CanvasRenderingContext2D & { fontStretch?: string; letterSpacing?: string };
    try {
      x.fontStretch = 'ultra-expanded';
      x.letterSpacing = '-4px';
    } catch {
      // Older engines draw the normal width; the name still reads.
    }
  };
  setFont(c);
  const widest = Math.max(...lines.map((l) => c.measureText(l).width));
  canvas.width = Math.ceil(widest + PAD * 2);
  canvas.height = Math.ceil(FONT_PX * LINE_GAP * lines.length + PAD * 2);
  setFont(c);
  c.clearRect(0, 0, canvas.width, canvas.height);
  c.fillStyle = ink;
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
  lines.forEach((line, i) => c.fillText(line, PAD, PAD + FONT_PX * 0.92 + i * FONT_PX * LINE_GAP));
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return { tex, aspect: canvas.width / canvas.height };
}

export function createNamePlane(art: NameArt, width: number): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  const mat = new THREE.MeshBasicMaterial({ map: art.tex, alphaTest: 0.35, alphaToCoverage: true, transparent: false, toneMapped: false });
  return new THREE.Mesh(new THREE.PlaneGeometry(width, width / art.aspect), mat);
}

export function swapName(mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>, art: NameArt, width: number): void {
  mesh.material.map?.dispose();
  mesh.material.map = art.tex;
  mesh.material.needsUpdate = true;
  mesh.geometry.dispose();
  mesh.geometry = new THREE.PlaneGeometry(width, width / art.aspect);
}
