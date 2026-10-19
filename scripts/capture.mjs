// Captures each live project's real page: a poster in the dark scheme, a poster in the light
// scheme, and an eight-second loop of the page moving. The project cards use the posters as their
// pictures and the 3D scene plays the loops on its screens. They are inputs, committed under
// public/work/<slug>/, and regenerated on purpose only:
//
//   node scripts/capture.mjs                    every live project
//   node scripts/capture.mjs carmine homecast   only these
//
// The pages run WebGL and WebAssembly, and a loop filmed on a software renderer comes out choppy
// with the wrong frame rates baked in. So Chrome is launched with its graphics hardware on and
// no software-rendering flags, and the run refuses to start if WebGL reports a software renderer.
//
// The loop is filmed with the browser's own screencast (what a context's recordVideo is built on)
// and encoded straight from its frames by a full ffmpeg. recordVideo would first write a lossy
// VP8 file, using an ffmpeg that Playwright downloads separately for each release and that can
// write neither H.264 nor VP9.

import { execFile } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { CHOREO, loopStartedAt } from './choreography.mjs';

const run = promisify(execFile);

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WORK = join(ROOT, 'public/work');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FFMPEG = process.env.FFMPEG_PATH || (existsSync('/opt/homebrew/bin/ffmpeg') ? '/opt/homebrew/bin/ffmpeg' : 'ffmpeg');
const FFPROBE = process.env.FFPROBE_PATH || FFMPEG.replace(/ffmpeg$/, 'ffprobe');

// Limits are decimal, so a file under them is under them however "KB" and "MB" are read.
const POSTER = { width: 1600, height: 1000, quality: 80, step: 8, floor: 24, bytes: 150_000, pauseMs: 300 };
const LOOP = { width: 1280, height: 800, seconds: 8, fps: 30, bytes: 1_500_000 };
LOOP.frames = LOOP.seconds * LOOP.fps;
// How long the recorder keeps going after the loop's last instant, so the last frame has arrived.
const FLUSH_MS = 400;
// Where each encoder starts, and where it stops trying; a loop over the limit goes up CRF_STEP.
const WEBM = { crf: 34, ceiling: 63 };
const MP4 = { crf: 26, ceiling: 51 };
const CRF_STEP = 4;

const rel = (path) => relative(ROOT, path);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
const size = (bytes) => (bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(2)} MB` : `${(bytes / 1000).toFixed(1)} KB`);

/** The live entries of the work collection, in the order the site shows them. */
function liveProjects() {
  const dir = join(ROOT, 'src/content/work');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')))
    .filter((entry) => entry.status === 'live')
    .sort((a, b) => a.order - b.order);
}

/** A full ffmpeg is needed: Playwright's own build writes neither H.264 nor VP9. */
async function checkFfmpeg() {
  let encoders;
  try {
    ({ stdout: encoders } = await run(FFMPEG, ['-hide_banner', '-encoders']));
    await run(FFPROBE, ['-version']);
  } catch (error) {
    throw new Error(`ffmpeg and ffprobe are needed (looked for ${FFMPEG}): ${error.message}`);
  }
  for (const encoder of ['libvpx-vp9', 'libx264']) {
    if (!encoders.includes(encoder)) {
      throw new Error(`${FFMPEG} cannot encode with ${encoder}; install a full ffmpeg (brew install ffmpeg)`);
    }
  }
}

async function launch() {
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--enable-gpu', '--ignore-gpu-blocklist'],
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  const renderer = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const info = gl && gl.getExtension('WEBGL_debug_renderer_info');
    return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : '';
  });
  await context.close();
  // Playwright adds --enable-unsafe-swiftshader itself, which only permits a software fallback.
  // The renderer name says whether the fallback happened.
  if (!renderer || /swiftshader|llvmpipe|software|basic render/i.test(renderer)) {
    await browser.close();
    throw new Error(`WebGL is unavailable or on a software renderer (${renderer || 'none'}); the loops need the real GPU`);
  }
  console.log(`chrome ${browser.version()} on ${renderer}`);
  return browser;
}

// ---- posters -------------------------------------------------------------------------------

async function photograph(browser, entry, colorScheme) {
  const context = await browser.newContext({
    viewport: { width: POSTER.width, height: POSTER.height },
    deviceScaleFactor: 1,
    colorScheme,
  });
  try {
    const page = await context.newPage();
    await page.goto(entry.live, { waitUntil: 'load', timeout: 60_000 });
    await CHOREO[entry.slug](page);
    await sleep(POSTER.pauseMs);
    return { png: await page.screenshot({ type: 'png' }), title: (await page.title()).trim() };
  } finally {
    await context.close();
  }
}

/** webp at quality 80, lowered a step at a time until the picture is under the limit. */
async function toWebp(png) {
  for (let quality = POSTER.quality; quality >= POSTER.floor; quality -= POSTER.step) {
    const buffer = await sharp(png).webp({ quality, effort: 6 }).toBuffer();
    if (buffer.length < POSTER.bytes) return { buffer, quality };
  }
  throw new Error(`a poster stays over ${size(POSTER.bytes)} down to quality ${POSTER.floor}`);
}

async function makePoster(browser, entry, colorScheme, out) {
  const { png, title } = await photograph(browser, entry, colorScheme);
  const { buffer, quality } = await toWebp(png);
  const meta = await sharp(buffer).metadata();
  if (meta.width !== POSTER.width || meta.height !== POSTER.height) {
    throw new Error(`a poster is ${meta.width}x${meta.height}, expected ${POSTER.width}x${POSTER.height}`);
  }
  await writeFile(out, buffer);
  return { title, quality };
}

// ---- loops ---------------------------------------------------------------------------------

/** Every frame the page paints, with the moment it was painted, until stop() is called. */
async function startScreencast(page) {
  const client = await page.context().newCDPSession(page);
  const frames = [];
  client.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    frames.push({ at: (metadata?.timestamp ?? Date.now() / 1000) * 1000, jpeg: Buffer.from(data, 'base64') });
    client.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await client.send('Page.startScreencast', {
    format: 'jpeg',
    quality: 92,
    maxWidth: LOOP.width,
    maxHeight: LOOP.height,
    everyNthFrame: 1,
  });
  return {
    async stop() {
      await client.send('Page.stopScreencast').catch(() => {});
      await client.detach().catch(() => {});
      return frames;
    },
  };
}

/**
 * The browser sends a frame only when the page changes. Sample those frames onto an even grid
 * (each instant shows the newest frame painted by then) and write the grid as numbered files.
 * Returns how many different pictures the loop contains.
 */
async function writeFrameGrid(frames, startMs, dir) {
  if (frames.length === 0 || frames[0].at > startMs + 250) {
    throw new Error('the recorder had no picture of the page when the loop began');
  }
  let newest = 0;
  const used = new Set();
  for (let k = 0; k < LOOP.frames; k++) {
    const instant = startMs + (k * 1000) / LOOP.fps;
    while (newest + 1 < frames.length && frames[newest + 1].at <= instant) newest++;
    used.add(newest);
    await writeFile(join(dir, `frame_${String(k + 1).padStart(4, '0')}.jpg`), frames[newest].jpeg);
  }
  return used.size;
}

async function film(browser, entry, dir) {
  const context = await browser.newContext({
    viewport: { width: LOOP.width, height: LOOP.height },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
  });
  try {
    const page = await context.newPage();
    const screencast = await startScreencast(page);
    await page.goto(entry.live, { waitUntil: 'load', timeout: 60_000 });
    await CHOREO[entry.slug](page);
    const start = loopStartedAt(page);
    if (!start) throw new Error('the choreography never marked the start of the loop');
    await sleep(start + LOOP.seconds * 1000 + FLUSH_MS - Date.now());
    return await writeFrameGrid(await screencast.stop(), start, dir);
  } finally {
    await context.close();
  }
}

// ---- encoding ------------------------------------------------------------------------------

// The frames are full-range JPEG. Video is limited-range, and a player that finds no colour tag
// on a picture this size assumes BT.709, so convert to BT.709 and say so in the file.
const COLOUR = [
  '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
  '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
];
const CODEC = {
  webm: (crf) => ['-c:v', 'libvpx-vp9', '-crf', String(crf), '-b:v', '0', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2'],
  mp4: (crf) => ['-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-movflags', '+faststart'],
};

/** Encode at the starting quality and raise the CRF a step at a time until the loop fits. */
async function encodeWithin(dir, out, kind, { crf, ceiling }) {
  for (; crf <= ceiling; crf += CRF_STEP) {
    await run(FFMPEG, [
      '-y', '-loglevel', 'error',
      '-framerate', String(LOOP.fps), '-i', join(dir, 'frame_%04d.jpg'),
      '-frames:v', String(LOOP.frames),
      ...COLOUR, ...CODEC[kind](crf), '-r', String(LOOP.fps), '-an', out,
    ]);
    const { size: bytes } = await stat(out);
    if (bytes <= LOOP.bytes) return { bytes, crf };
  }
  throw new Error(`${kind} stays over ${size(LOOP.bytes)} up to CRF ${ceiling}`);
}

/** The encoded file must be what the page that embeds it expects: one picture track, no sound. */
async function verifyLoop(path) {
  const { stdout } = await run(FFPROBE, [
    '-v', 'error', '-show_entries', 'stream=codec_type,width,height:format=duration', '-of', 'json', path,
  ]);
  const { streams, format } = JSON.parse(stdout);
  const problems = [];
  if (streams.length !== 1 || streams[0].codec_type !== 'video') {
    problems.push(`has ${streams.length} streams, expected one video stream`);
  } else if (streams[0].width !== LOOP.width || streams[0].height !== LOOP.height) {
    problems.push(`is ${streams[0].width}x${streams[0].height}`);
  }
  const seconds = Number(format.duration);
  if (Math.abs(seconds - LOOP.seconds) > 0.05) problems.push(`lasts ${seconds} s`);
  if (problems.length) throw new Error(`${rel(path)} ${problems.join(', ')}`);
  return seconds;
}

// ---- one project ---------------------------------------------------------------------------

/** Merge one project's record into the manifest, which keeps the entries of the other projects. */
async function updateManifest(slug, record) {
  const path = join(WORK, 'manifest.json');
  const manifest = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
  manifest[slug] = record;
  const order = liveProjects().map((e) => e.slug);
  const rank = (s) => (order.includes(s) ? order.indexOf(s) : order.length);
  const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => rank(a) - rank(b)));
  await writeFile(path, `${JSON.stringify(sorted, null, 2)}\n`);
}

async function capture(browser, entry) {
  const slug = entry.slug;
  if (!CHOREO[slug]) throw new Error(`no choreography for ${slug}`);
  const scratch = await mkdtemp(join(tmpdir(), `capture-${slug}-`));
  try {
    const frames = join(scratch, 'frames');
    await mkdir(frames);

    const dark = await makePoster(browser, entry, 'dark', join(scratch, 'poster.webp'));
    await makePoster(browser, entry, 'light', join(scratch, 'poster-light.webp'));
    const pictures = await film(browser, entry, frames);
    const webm = await encodeWithin(frames, join(scratch, 'loop.webm'), 'webm', WEBM);
    const mp4 = await encodeWithin(frames, join(scratch, 'loop.mp4'), 'mp4', MP4);
    const seconds = await verifyLoop(join(scratch, 'loop.webm'));
    await verifyLoop(join(scratch, 'loop.mp4'));

    // Every file exists and checks out, so the project's folder is replaced only now.
    const target = join(WORK, slug);
    await mkdir(target, { recursive: true });
    const notes = {
      'poster.webp': `${POSTER.width}x${POSTER.height}  quality ${dark.quality}`,
      'poster-light.webp': `${POSTER.width}x${POSTER.height}`,
      'loop.webm': `${seconds.toFixed(2)} s  ${LOOP.width}x${LOOP.height}  crf ${webm.crf}  ${pictures} different frames`,
      'loop.mp4': `crf ${mp4.crf}`,
    };
    for (const [name, note] of Object.entries(notes)) {
      await copyFile(join(scratch, name), join(target, name));
      const { size: bytes } = await stat(join(target, name));
      console.log(`${slug.padEnd(25)} ${rel(join(target, name)).padEnd(51)} ${size(bytes).padStart(9)}  ${note}`);
    }
    await updateManifest(slug, {
      capturedAt: new Date().toISOString(),
      title: dark.title,
      poster: { bytes: (await stat(join(target, 'poster.webp'))).size },
      loop: { seconds: LOOP.seconds, webmBytes: webm.bytes, mp4Bytes: mp4.bytes },
    });
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

async function main(slugs) {
  const live = liveProjects();
  const unknown = slugs.filter((slug) => !live.some((e) => e.slug === slug));
  if (unknown.length) {
    console.error(`not a live project: ${unknown.join(', ')} (live: ${live.map((e) => e.slug).join(', ')})`);
    process.exitCode = 2;
    return;
  }
  const chosen = live.filter((e) => slugs.length === 0 || slugs.includes(e.slug));
  await checkFfmpeg();
  const browser = await launch();
  const failed = [];
  try {
    for (const entry of chosen) {
      try {
        await capture(browser, entry);
      } catch (error) {
        console.error(`${entry.slug}: ${error.message}`);
        failed.push(entry.slug);
      }
    }
  } finally {
    await browser.close();
  }
  if (failed.length) {
    console.error(`failed: ${failed.join(', ')}`);
    process.exitCode = 1;
  } else {
    console.log(`manifest ${rel(join(WORK, 'manifest.json'))}`);
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    // A missing tool or a software renderer is a setup problem: say so plainly, without a stack.
    console.error(error.message);
    process.exitCode = 1;
  }
}
