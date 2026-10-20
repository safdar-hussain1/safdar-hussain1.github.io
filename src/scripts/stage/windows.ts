import * as THREE from 'three';

// A facade of lit windows, drawn once per seed: a dark wall with a grid of cells, most of them
// warm, some cool, a few dark. Used as the colour map and the emissive map of the blocks.
export interface WindowOptions {
  cols?: number;
  rows?: number;
  wall?: string;
  litShare?: number;
}

export function windowTexture(rand: () => number, opts: WindowOptions = {}): THREE.CanvasTexture {
  const cols = opts.cols ?? 6;
  const rows = opts.rows ?? 14;
  const wall = opts.wall ?? '#0a0f1f';
  const litShare = opts.litShare ?? 0.62;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const c = canvas.getContext('2d')!;
  c.fillStyle = wall;
  c.fillRect(0, 0, canvas.width, canvas.height);
  const cw = canvas.width / cols;
  const ch = canvas.height / rows;
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      const v = rand();
      if (v > litShare) continue;
      const warm = rand() > 0.3;
      const bright = 0.55 + rand() * 0.45;
      c.fillStyle = warm ? `rgba(255, 214, 150, ${bright})` : `rgba(170, 200, 255, ${bright * 0.85})`;
      c.fillRect(k * cw + cw * 0.22, r * ch + ch * 0.26, cw * 0.56, ch * 0.48);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 4;
  return tex;
}

// A soft radial glow for the accent light behind a screen or a sign; additive, so colour is
// given by the material.
export function glowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const c = canvas.getContext('2d')!;
  const g = c.createRadialGradient(128, 128, 8, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A lit sign with a project's name, drawn in the display face; the canvas is sized to the text.
export function signTexture(text: string, ink: string, back: string, family = 'Archivo Variable'): { tex: THREE.CanvasTexture; aspect: number } {
  const canvas = document.createElement('canvas');
  const c = canvas.getContext('2d')!;
  const font = `600 72px "${family}", "Archivo", system-ui, sans-serif`;
  c.font = font;
  const width = Math.ceil(c.measureText(text).width) + 72;
  canvas.width = Math.max(128, width);
  canvas.height = 128;
  c.fillStyle = back;
  c.fillRect(0, 0, canvas.width, canvas.height);
  c.font = font;
  c.fillStyle = ink;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  const ctx = c as CanvasRenderingContext2D & { fontStretch?: string; letterSpacing?: string };
  try {
    ctx.fontStretch = 'expanded';
    ctx.letterSpacing = '1px';
  } catch {
    // Older engines draw the normal width.
  }
  c.fillText(text, canvas.width / 2, canvas.height / 2 + 4);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return { tex, aspect: canvas.width / canvas.height };
}

// The sky behind the city: an equirectangular gradient from the zenith colour down to the fog
// colour at the horizon, so the fog and the sky meet without a seam.
export function skyTexture(zenith: string, horizon: string, ground: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 256;
  const c = canvas.getContext('2d')!;
  const g = c.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, zenith);
  g.addColorStop(0.36, zenith);
  g.addColorStop(0.5, horizon);
  g.addColorStop(0.53, horizon);
  g.addColorStop(0.7, ground);
  g.addColorStop(1, ground);
  c.fillStyle = g;
  c.fillRect(0, 0, 16, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.mapping = THREE.EquirectangularReflectionMapping;
  return tex;
}

// A soft studio for the glass to reflect: a dim room with two large soft lights, nothing
// hard-edged, so the lens shows a gentle rim and one highlight rather than a reflected grid.
export function studioTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const c = canvas.getContext('2d')!;
  c.fillStyle = '#10152a';
  c.fillRect(0, 0, 256, 128);
  const light = (x: number, y: number, r: number, a: number) => {
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,250,240,${a})`);
    g.addColorStop(0.5, `rgba(220,230,255,${a * 0.35})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 256, 128);
  };
  light(64, 30, 86, 1.0);
  light(205, 62, 70, 0.6);
  light(128, 120, 110, 0.25);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.mapping = THREE.EquirectangularReflectionMapping;
  return tex;
}
