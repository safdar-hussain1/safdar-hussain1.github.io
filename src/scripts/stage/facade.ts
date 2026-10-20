import * as THREE from 'three';
import { matte } from './materials';
import { glowTexture } from './windows';

// The screen on a facade: a thin bevelled frame, the project's own moving page as a video
// texture (its poster until the video plays), and a soft glow in the project's colour.
export const SCREEN_W = 2.0;
export const SCREEN_H = 1.25;

export interface Facade {
  group: THREE.Group;
  screen: THREE.Mesh;
  glow: THREE.Mesh;
  play(): void;
  pause(): void;
  setFocus(k: number): void;
  /** For stills: show the poster even if the video could play. */
  usePoster(): void;
  video: HTMLVideoElement | null;
}

let sharedGlow: THREE.CanvasTexture | null = null;

export function attachFacade(mount: THREE.Object3D, opts: { video: HTMLVideoElement | null; poster: string; accent: string }): Facade {
  const group = new THREE.Group();
  const frameMat = matte(0x121a30);
  const bevelMat = matte(0x2b3656, { roughness: 0.6 });
  const backMat = matte(0x27304e, { roughness: 0.8 });
  // The plate's road-facing side is dark so the screen reads; its back and edges are the
  // bevel's lighter tone, so a board seen from behind is a board, not a hole.
  const back = new THREE.Mesh(new THREE.BoxGeometry(SCREEN_W + 0.14, SCREEN_H + 0.14, 0.06), [backMat, backMat, backMat, backMat, backMat, frameMat]);
  back.position.z = -0.03;
  back.castShadow = true;
  group.add(back);
  const t = 0.035;
  for (const [w, h, x, y] of [
    [SCREEN_W + 0.1, t, 0, SCREEN_H / 2 + 0.03],
    [SCREEN_W + 0.1, t, 0, -SCREEN_H / 2 - 0.03],
    [t, SCREEN_H + 0.1, SCREEN_W / 2 + 0.03, 0],
    [t, SCREEN_H + 0.1, -SCREEN_W / 2 - 0.03, 0],
  ] as const) {
    const bevel = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.02), bevelMat);
    bevel.position.set(x, y, -0.065);
    group.add(bevel);
  }

  const loader = new THREE.TextureLoader();
  const posterTex = loader.load(opts.poster);
  posterTex.colorSpace = THREE.SRGBColorSpace;
  posterTex.anisotropy = 8;
  const screenMat = new THREE.MeshBasicMaterial({ map: posterTex, toneMapped: false, color: 0xbfbfbf });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN_W, SCREEN_H), screenMat);
  screen.position.z = -0.066;
  screen.rotation.y = Math.PI;
  group.add(screen);

  sharedGlow ??= glowTexture();
  const glowMat = new THREE.MeshBasicMaterial({ map: sharedGlow, color: opts.accent, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN_W * 2.3, SCREEN_H * 2.8), glowMat);
  glow.position.z = 0.012;
  glow.rotation.y = Math.PI;
  group.add(glow);

  let videoTex: THREE.VideoTexture | null = null;
  let posterOnly = false;
  const video = opts.video;
  if (video) {
    video.addEventListener(
      'playing',
      () => {
        if (posterOnly) return;
        videoTex ??= new THREE.VideoTexture(video);
        videoTex.colorSpace = THREE.SRGBColorSpace;
        screenMat.map = videoTex;
        screenMat.needsUpdate = true;
      },
      { once: true },
    );
  }

  mount.add(group);
  return {
    group,
    screen,
    glow,
    video,
    play() {
      if (video && video.paused && !posterOnly) video.play().catch(() => {});
    },
    pause() {
      if (video && !video.paused) video.pause();
    },
    setFocus(k) {
      glowMat.opacity = 0.18 + 0.5 * k;
      screenMat.color.setScalar(0.72 + 0.28 * k);
    },
    usePoster() {
      posterOnly = true;
      if (video) video.pause();
      screenMat.map = posterTex;
      screenMat.needsUpdate = true;
    },
  };
}
