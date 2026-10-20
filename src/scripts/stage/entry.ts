import * as THREE from 'three';
import { seeded, smoothstep, stopLayout, type LadderStep } from './math';
import { skyTexture, studioTexture } from './windows';
import { paletteFor, type CityPalette } from './palette';
import { GLOW } from './materials';
import { glowTexture } from './windows';
import { createLens, type LensHandle } from './lens';
import { createNamePlane, nameTexture, swapName } from './name';
import { buildCity, type CityHandle } from './city';
import { addScenery, type SceneryHandle } from './scenery';
import { buildBuilding, type Building, type StageEntry } from './buildings';
import { attachFacade, type Facade } from './facade';
import { createLife, type Life } from './life';
import { createTour, type Tour, type TourFrame } from './tour';
import { createFly } from './fly';
import { createDrive, type Drive } from './egg';
import type { Captions } from '../captions';

// The stage: one canvas behind the page, one scene, one camera. In 'lens' mode only the glass
// and the name exist (tablets, inside the hero's text block); in 'city' mode the whole city
// lies below and the scroll drives the camera through the lens and along the road.
export interface StageOptions {
  canvas: HTMLCanvasElement;
  mode: 'lens' | 'city';
  entries: StageEntry[];
  theme(): 'dark' | 'light';
  captions: Captions;
  still: 'hero' | 'city' | null;
  wrapLeft(): number;
  /** The page's h1 box as fractions of the canvas (lens mode), or null. */
  anchor?(): { x: number; y: number; w: number; h: number } | null;
  sound?: { play(cue: 'tick' | 'hum-start' | 'hum-stop' | 'focus'): void } | null;
  /** The stage ended itself (the ladder, or reduced motion turned on); the page is flat again. */
  onEnd?(reason: 'slow' | 'reduced-motion'): void;
  doc?: Document;
}

export interface StageHandle {
  mode: 'lens' | 'city';
  ready: Promise<void>;
  /** Re-reads the canvas box and the page layout, for after the page's classes change. */
  relayout(): void;
  renderer: THREE.WebGLRenderer;
  tour: Tour | null;
  drive: Drive | null;
  setTheme(t: 'dark' | 'light'): void;
  applyLadder(step: LadderStep): void;
  destroy(): void;
}

const HERO_CAM = new THREE.Vector3(-33, 8.2, 0);
const HERO_LOOK = new THREE.Vector3(-14, 4.6, 0);
const CITY_STILL_CAM = new THREE.Vector3(-22.5, 4.6, -6.2);
const CITY_STILL_LOOK = new THREE.Vector3(-8, 1.1, 1.8);
const NAME_LINES = ['SAFDAR', 'HUSSAIN'];
const NAME_W = 5.0;

type Dock = { setHooks(h: { beforeOpen?(slug: string): Promise<void> | void; afterClose?(slug: string): Promise<void> | void }): void };

export function startStage(opts: StageOptions): StageHandle {
  const doc = opts.doc ?? document;
  const win = doc.defaultView!;
  const { canvas, mode } = opts;
  const city = mode === 'city';
  let theme = opts.theme();
  let palette = paletteFor(theme);
  GLOW.scale = palette.glow;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(win.devicePixelRatio || 1, city ? 2 : 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = theme === 'light' ? 1.0 : 1.1;
  renderer.shadowMap.enabled = city;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.08, 90);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const studio = studioTexture();
  const env = pmrem.fromEquirectangular(studio).texture;
  pmrem.dispose();
  let sky: THREE.CanvasTexture | null = null;
  function paintSky(): void {
    if (!city) {
      renderer.setClearColor(palette.ground, 1);
      return;
    }
    sky?.dispose();
    sky = skyTexture(palette.sky, palette.fogColor, palette.ground);
    scene.background = sky;
    renderer.setClearColor(palette.fogColor, 1);
  }
  paintSky();

  // The name and the glass.
  let nameArt = nameTexture(NAME_LINES, palette.ink);
  const name = createNamePlane(nameArt, NAME_W);
  scene.add(name);
  const lens: LensHandle = createLens(scene, palette);
  lens.mesh.material.envMap = env;
  lens.mesh.material.needsUpdate = true;

  // The city, when it runs.
  let cityHandle: CityHandle | null = null;
  let scenery: SceneryHandle | null = null;
  const buildings: Building[] = [];
  const facades = new Map<string, Facade>();
  let life: Life | null = null;
  let tour: Tour | null = null;
  let drive: Drive | null = null;
  const media = doc.createElement('div');
  media.className = 'stage-media';
  media.setAttribute('aria-hidden', 'true');

  if (city) {
    const rand = seeded(7);
    cityHandle = buildCity(scene, palette);
    scenery = addScenery(cityHandle, rand, palette);
    const ordered = [...opts.entries].sort((a, b) => stopOrder(a) - stopOrder(b));
    const layout = stopLayout(ordered.length);
    ordered.forEach((entry, i) => {
      const b = buildBuilding(entry, layout[i].x, layout[i].side, { rand, palette });
      cityHandle!.group.add(b.group);
      buildings.push(b);
      if (entry.status === 'live' && b.screenMount) {
        const video = opts.still ? null : facadeVideo(doc, entry.slug);
        if (video) media.append(video);
        const facade = attachFacade(b.screenMount, { video, poster: `/work/${entry.slug}/poster-sm.webp`, accent: entry.accent });
        if (opts.still) facade.usePoster();
        facades.set(entry.slug, facade);
      }
    });
    doc.body.append(media);
    const sightline = opts.entries.find((e) => e.building === 'depot');
    life = createLife(scene, cityHandle.road, buildings, { sightline: sightline?.accent ?? '#9333ea' });
  }

  // The hero view: the name's left edge sits on the page's text column, the lens over its
  // right half; both are placed from the viewport's aspect so the picture holds at any width.
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const lensWorld = new THREE.Vector3();
  function compose(): void {
    const w = canvas.clientWidth || win.innerWidth;
    const h = canvas.clientHeight || win.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    const heroPos = city ? HERO_CAM : new THREE.Vector3(0, 0, 7.5);
    const heroLook = city ? HERO_LOOK : new THREE.Vector3(0, 0, 0);
    const forward = heroLook.clone().sub(heroPos).normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, forward).normalize();
    const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));

    const dName = 7.5;
    const halfH = dName * tanH;
    const halfW = halfH * camera.aspect;
    const dLens = 3.2;
    const lhH = dLens * tanH;
    const lhW = lhH * camera.aspect;
    const box = city ? null : opts.anchor?.() ?? null;
    let nameW: number;
    let rightOff: number;
    let upOff: number;
    let radius: number;
    let lensRight: number;
    let lensUp: number;
    if (box) {
      // Lens mode: the glass name sits on the page's own name, a little taller than its box.
      const nameH = box.h * 1.3 * 2 * halfH;
      nameW = nameH * nameArt.aspect;
      const nameWFrac = nameW / (2 * halfW);
      rightOff = (box.x + nameWFrac / 2 - 0.5) * 2 * halfW;
      upOff = (0.5 - (box.y + box.h * 0.5)) * 2 * halfH;
      radius = (nameH / (2 * halfH)) * 0.62 * 2 * lhH;
      lensRight = (box.x + nameWFrac * 0.74 - 0.5) * 2 * lhW;
      lensUp = (0.5 - (box.y + box.h * 0.38)) * 2 * lhH;
    } else {
      const leftFrac = Math.min(0.2, opts.wrapLeft() / w);
      nameW = Math.min(NAME_W, 0.66 * 2 * halfW);
      rightOff = -halfW + leftFrac * 2 * halfW + nameW / 2;
      upOff = (0.5 - 0.47) * 2 * halfH;
      radius = Math.min(lhH * 0.56, lhW * 0.6);
      lensRight = (leftFrac + (nameW / (2 * halfW)) * 0.78 - 0.5) * 2 * lhW;
      lensUp = (0.5 - 0.47) * 2 * lhH;
    }
    name.scale.setScalar(nameW / NAME_W);
    name.position.copy(heroPos).addScaledVector(forward, dName).addScaledVector(right, rightOff).addScaledVector(up, upOff);
    name.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(heroPos, name.position, up));
    lens.group.position.copy(heroPos).addScaledVector(forward, dLens).addScaledVector(right, lensRight).addScaledVector(up, lensUp);
    lens.group.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(heroPos, lens.group.position, up));
    lens.setRadius(radius);
    lensWorld.copy(lens.group.position);

    if (!city || !tour) {
      camera.position.copy(heroPos);
      camera.lookAt(heroLook);
    }
    tour?.layout();
  }

  if (city) {
    tour = createTour({
      camera,
      hero: { pos: HERO_CAM, look: HERO_LOOK },
      lensPos: () => lensWorld.clone(),
      stops: buildings.filter((b) => b.entry.status === 'live'),
      facades,
      captions: opts.captions,
      city: cityHandle!,
      doc,
      pointer,
      onFocus: () => opts.sound?.play('tick'),
    });
    const fly = createFly(camera);
    let flown = false;
    const dock = (win as unknown as { __dock?: Dock }).__dock;
    dock?.setHooks({
      async beforeOpen(slug) {
        drive?.stop();
        const b = buildings.find((x) => x.entry.slug === slug);
        if (!b || !tour || lastFrame.fade < 0.05) return;
        tour.setFollowing(false);
        flown = true;
        doc.body.classList.add('fly-on');
        await fly.toFacade(b, lastFrame.dive < 1 ? 900 : 600);
      },
      async afterClose() {
        if (!tour || !flown) {
          tour?.setFollowing(true);
          return;
        }
        flown = false;
        await fly.back();
        doc.body.classList.remove('fly-on');
        tour.setFollowing(true);
      },
    });
    if (life) {
      drive = createDrive({
        car: life.sightline.group,
        camera,
        road: cityHandle!.road,
        doc,
        onStart() {
          tour?.setFollowing(false);
          life?.setDriving(true);
          doc.body.classList.add('drive-on');
        },
        onStop() {
          life?.setDriving(false);
          doc.body.classList.remove('drive-on');
          tour?.snap();
          tour?.setFollowing(true);
        },
      });
    }
  }
  compose();

  // While a project is docked the dock covers the screen: the city stops rendering and its
  // loops pause, and both come back the moment the dock closes (before the camera flies back).
  const dockEl = doc.getElementById('dock');
  // A shared #work/<slug> link opens the dock before the stage starts: then the first frame
  // renders (so the stage is ready) and the loop stops at once.
  let docked = doc.body.classList.contains('dock-open');
  const onDockOpen = () => {
    docked = true;
    renderer.setAnimationLoop(null);
    facades.forEach((f) => f.pause());
  };
  const onDockClose = () => {
    docked = false;
    if (!destroyed && !doc.hidden && onScreen) renderer.setAnimationLoop(frame);
  };
  dockEl?.addEventListener('dock:open', onDockOpen);
  dockEl?.addEventListener('dock:close', onDockClose);

  // Pointer, resize, visibility and theme.
  const onPointer = (e: PointerEvent) => {
    pointer.tx = (e.clientX / win.innerWidth) * 2 - 1;
    pointer.ty = -((e.clientY / win.innerHeight) * 2 - 1);
  };
  win.addEventListener('pointermove', onPointer, { passive: true });
  const ro = new ResizeObserver(() => compose());
  ro.observe(canvas);
  win.addEventListener('resize', compose);
  const themeObserver = new MutationObserver(() => setTheme(opts.theme()));
  themeObserver.observe(doc.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const mq = win.matchMedia('(prefers-color-scheme: dark)');
  const onScheme = () => setTheme(opts.theme());
  mq.addEventListener('change', onScheme);
  // Reduced motion turned on while the page is open ends the stage; the flat page remains.
  const motionQuery = win.matchMedia('(prefers-reduced-motion: reduce)');
  const onMotion = () => {
    if (motionQuery.matches) {
      destroy();
      opts.onEnd?.('reduced-motion');
    }
  };
  motionQuery.addEventListener('change', onMotion);
  // The lens alone sleeps while its canvas is off screen.
  let onScreen = true;
  const io = new IntersectionObserver((records) => {
    onScreen = records.some((r) => r.isIntersecting);
    if (destroyed || docked || doc.hidden) return;
    renderer.setAnimationLoop(onScreen ? frame : null);
  });
  if (!city) io.observe(canvas);

  function setTheme(t: 'dark' | 'light'): void {
    if (t === theme) return;
    theme = t;
    palette = paletteFor(t);
    GLOW.scale = palette.glow;
    nameArt = nameTexture(NAME_LINES, palette.ink);
    swapName(name, nameArt, NAME_W);
    lens.setPalette(palette);
    paintSky();
    cityHandle?.setPalette(palette);
    scenery?.setPalette(palette);
    buildings.forEach((b) => b.setPalette(palette));
    renderer.toneMappingExposure = t === 'light' ? 1.0 : 1.1;
    opts.captions.refresh();
  }

  // The loop.
  let lastNow = 0;
  let frames = 0;
  let lastOpacity = 1;
  let lastTouring = false;
  let lastHeroFade = 1;
  // The line and the cue fade with the dive; the h1 stays, hidden from sight but not from readers.
  const heroText = doc.querySelector<HTMLElement>('.hero__copy');
  let lastFrame: TourFrame = { p: 0, dive: 0, road: 0, idx: 0, focus: 0, near: 1, fade: 1, inTour: false };
  let resolveReady: () => void = () => {};
  const ready = new Promise<void>((r) => (resolveReady = r));
  let destroyed = false;

  function frame(now: number): void {
    if (destroyed) return;
    const dt = lastNow ? Math.min(0.05, (now - lastNow) / 1000) : 1 / 60;
    lastNow = now;
    pointer.x += (pointer.tx - pointer.x) * 0.06;
    pointer.y += (pointer.ty - pointer.y) * 0.06;

    if (city && tour) {
      if (drive?.active()) drive.update(dt);
      lastFrame = tour.update(now, dt);
      if (opts.still === 'city') {
        camera.position.copy(CITY_STILL_CAM);
        camera.lookAt(CITY_STILL_LOOK);
      }
      const dist = camera.position.distanceTo(lensWorld);
      lens.group.visible = lastFrame.dive < 0.55 && dist > 0.3 && opts.still !== 'city';
      // Once the glass is behind the camera the name thins out and is gone before the camera
      // reaches it; while the glass is in front, the name stays opaque so the glass can bend it.
      const nameFade = 1 - smoothstep(0.28, 0.44, lastFrame.dive);
      name.visible = nameFade > 0.01 && opts.still !== 'city';
      if (name.material.transparent !== nameFade < 0.999) {
        name.material.transparent = nameFade < 0.999;
        name.material.needsUpdate = true;
      }
      name.material.opacity = nameFade;
      const touring = lastFrame.inTour && lastFrame.dive >= 1 && !drive?.active();
      // The fog closes in as the camera comes down to the street.
      const fog = scene.fog as THREE.Fog;
      const fogIn = smoothstep(0.2, 1, lastFrame.dive);
      fog.near = THREE.MathUtils.lerp(palette.fog[0] * 1.9, palette.fog[0], fogIn);
      fog.far = THREE.MathUtils.lerp(palette.fog[1] * 1.9, palette.fog[1], fogIn);
      if (touring !== lastTouring) {
        lastTouring = touring;
        doc.body.classList.toggle('tour-on', touring);
        const rail = doc.querySelector<HTMLElement>('.rail');
        if (rail) rail.hidden = !touring;
      }
      const heroFade = 1 - smoothstep(0.04, 0.42, lastFrame.dive);
      if (Math.abs(heroFade - lastHeroFade) > 0.01) {
        lastHeroFade = heroFade;
        if (heroText) {
          heroText.style.opacity = heroFade.toFixed(2);
          // Gone for good once faded: nothing to read and nothing to tab to behind the city.
          heroText.style.visibility = heroFade < 0.02 ? 'hidden' : '';
        }
      }
      const opacity = drive?.active() ? 1 : lastFrame.fade;
      if (Math.abs(opacity - lastOpacity) > 0.01) {
        lastOpacity = opacity;
        if (opacity > 0.995) canvas.style.removeProperty('opacity');
        else canvas.style.opacity = opacity.toFixed(2);
      }
      if (opacity < 0.01 && frames > 2) return;
      if (life && !doc.hidden) life.update(now / 1000, camera.position.x);
    } else {
      camera.position.set(pointer.x * 0.12, pointer.y * 0.08, 7.5);
      camera.lookAt(0, 0, 0);
    }
    lens.update(now, pointer);
    renderer.render(scene, camera);
    frames += 1;
    if (frames === 1) {
      resolveReady();
      if (docked) onDockOpen();
    }
  }
  renderer.setAnimationLoop(frame);
  const onVisibility = () => {
    if (opts.still || destroyed) return;
    renderer.setAnimationLoop(doc.hidden || docked || !onScreen ? null : frame);
  };
  doc.addEventListener('visibilitychange', onVisibility);

  // The focus pull on load; stills skip straight to sharp.
  void ready.then(() => {
    if (opts.still) {
      // One sharp frame once every poster has arrived, then the loop stops: a still is a
      // still, and costs nothing after.
      lens.sharp();
      void Promise.all([...facades.values()].map((f) => f.ready)).then(() => {
        let n = 0;
        const tick = () => {
          n += 1;
          if (n < 6) requestAnimationFrame(tick);
          else {
            renderer.setAnimationLoop(null);
            doc.title = 'STILL READY';
          }
        };
        requestAnimationFrame(tick);
      });
      return;
    }
    opts.sound?.play('hum-start');
    void lens.focusPull().then(() => opts.sound?.play('hum-stop'));
  });

  function applyLadder(step: LadderStep): void {
    if (step === 'full') return;
    if (cityHandle) cityHandle.setShadows(false);
    if (step === 'no-shadows') return;
    life?.setEnabled(false);
    if (step === 'no-life') return;
    destroy();
    opts.onEnd?.('slow');
  }

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    renderer.setAnimationLoop(null);
    win.removeEventListener('pointermove', onPointer);
    win.removeEventListener('resize', compose);
    ro.disconnect();
    themeObserver.disconnect();
    mq.removeEventListener('change', onScheme);
    doc.removeEventListener('visibilitychange', onVisibility);
    motionQuery.removeEventListener('change', onMotion);
    io.disconnect();
    dockEl?.removeEventListener('dock:open', onDockOpen);
    dockEl?.removeEventListener('dock:close', onDockClose);
    tour?.destroy();
    drive?.destroy();
    (win as unknown as { __dock?: Dock }).__dock?.setHooks({});
    opts.captions.clear();
    if (heroText) {
      heroText.style.removeProperty('opacity');
      heroText.style.removeProperty('visibility');
    }
    media.querySelectorAll('video').forEach((v) => {
      v.pause();
      v.removeAttribute('src');
      v.querySelectorAll('source').forEach((s) => s.remove());
      v.load();
    });
    media.remove();
    // Every GPU resource goes: geometries, materials and their textures, the environment,
    // then the context itself.
    const textures = new Set<THREE.Texture>([env, studio, glowTexture()]);
    if (sky) textures.add(sky);
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const mat of mats) {
        for (const key of ['map', 'emissiveMap', 'alphaMap', 'envMap'] as const) {
          const t = (mat as unknown as Record<string, unknown>)[key];
          if (t instanceof THREE.Texture) textures.add(t);
        }
        mat.dispose();
      }
    });
    textures.forEach((t) => t.dispose());
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
    doc.body.classList.remove('stage-on', 'lens-on', 'tour-on', 'drive-on', 'fly-on');
  }

  return { mode, ready, renderer, tour, drive, setTheme, applyLadder, destroy, relayout: compose };
}

function stopOrder(e: StageEntry): number {
  const order: Record<string, number> = { hospital: 0, clinic: 1, gantry: 2, field: 3, studio: 4, towers: 5, hall: 6, depot: 7 };
  return order[e.building] ?? 99;
}

function facadeVideo(doc: Document, slug: string): HTMLVideoElement | null {
  const box = doc.querySelector<HTMLElement>(`.plate[data-slug="${slug}"] [data-loop-webm]`);
  if (!box) return null;
  const v = doc.createElement('video');
  v.className = 'loop facade-loop';
  v.muted = true;
  v.loop = true;
  v.playsInline = true;
  v.preload = 'none';
  v.tabIndex = -1;
  for (const [src, type] of [
    [box.dataset.loopWebm, 'video/webm'],
    [box.dataset.loopMp4, 'video/mp4'],
  ] as const) {
    if (!src) continue;
    const s = doc.createElement('source');
    s.src = src;
    s.type = type;
    v.append(s);
  }
  return v;
}

export type { CityPalette };
