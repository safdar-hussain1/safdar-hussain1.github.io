// The local server that mirrors the live origin: the pure helpers first, then real
// requests against servers running on free ports over a throwaway directory tree,
// then the command line itself.

import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createReplica, mimeFor, mountFor, parseRange, splitPath } from '../scripts/lib/static.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serveScript = path.join(repoRoot, 'scripts', 'serve.mjs');

describe('mimeFor', () => {
  it('mimeFor maps wasm, onnx, webm, woff2', () => {
    expect(mimeFor('sql-wasm.wasm')).toBe('application/wasm');
    expect(mimeFor('models/yolo.onnx')).toBe('application/octet-stream');
    expect(mimeFor('clips/loop.webm')).toBe('video/webm');
    expect(mimeFor('fonts/archivo.woff2')).toBe('font/woff2');
  });

  // These are the types GitHub Pages sends for the same files.
  it.each([
    ['index.html', 'text/html; charset=utf-8'],
    ['app.js', 'application/javascript; charset=utf-8'],
    ['ort.mjs', 'text/javascript; charset=utf-8'],
    ['site.css', 'text/css; charset=utf-8'],
    ['manifest.json', 'application/json; charset=utf-8'],
    ['sql-wasm.wasm', 'application/wasm'],
    ['yolo.onnx', 'application/octet-stream'],
    ['face_landmarker.task', 'application/octet-stream'],
    ['demo.db', 'application/octet-stream'],
    ['poster.png', 'image/png'],
    ['photo.jpg', 'image/jpeg'],
    ['photo.jpeg', 'image/jpeg'],
    ['poster.webp', 'image/webp'],
    ['favicon.svg', 'image/svg+xml'],
    ['favicon.ico', 'image/x-icon'],
    ['archivo.woff2', 'font/woff2'],
    ['loop.webm', 'video/webm'],
    ['loop.mp4', 'video/mp4'],
    ['robots.txt', 'text/plain; charset=utf-8'],
    ['ARCHITECTURE.md', 'text/markdown; charset=utf-8'],
    ['sitemap.xml', 'application/xml'],
  ])('maps %s to %s', (file, type) => {
    expect(mimeFor(file)).toBe(type);
  });

  it('ignores case and the directories in front of the name', () => {
    expect(mimeFor('/some/dir.with.dots/Photo.PNG')).toBe('image/png');
    expect(mimeFor('a/b/INDEX.HTML')).toBe('text/html; charset=utf-8');
  });

  it('falls back to octet-stream for unknown names and never reads inherited properties', () => {
    for (const name of ['notes.xyz', 'LICENSE', '.nojekyll', 'archive.', 'x.constructor', 'x.__proto__', 'x.toString', '']) {
      expect(mimeFor(name)).toBe('application/octet-stream');
    }
  });
});

describe('parseRange', () => {
  it('parseRange handles bytes=0-99, bytes=100-, invalid', () => {
    expect(parseRange('bytes=0-99', 1000)).toEqual({ start: 0, end: 99 });
    expect(parseRange('bytes=100-', 1000)).toEqual({ start: 100, end: 999 });
    expect(parseRange('bytes=abc', 1000)).toBeNull();
    expect(parseRange(undefined, 1000)).toBeNull();
  });

  it('reads a suffix range as the last bytes of the file', () => {
    expect(parseRange('bytes=-50', 1000)).toEqual({ start: 950, end: 999 });
    expect(parseRange('bytes=-5000', 1000)).toEqual({ start: 0, end: 999 });
  });

  it('clamps an end past the file to the last byte', () => {
    expect(parseRange('bytes=990-5000', 1000)).toEqual({ start: 990, end: 999 });
    expect(parseRange('bytes=0-0', 1000)).toEqual({ start: 0, end: 0 });
    expect(parseRange('bytes=999-999', 1000)).toEqual({ start: 999, end: 999 });
  });

  it('accepts the unit in any case and spaces around the parts', () => {
    expect(parseRange('Bytes=0-9', 100)).toEqual({ start: 0, end: 9 });
    expect(parseRange(' bytes = 10 - 19 ', 100)).toEqual({ start: 10, end: 19 });
  });

  it.each([
    [''],
    ['bytes='],
    ['bytes=-'],
    ['bytes=-0'],
    ['bytes=5-1'],
    ['bytes=1000-'],
    ['bytes=1000-2000'],
    ['bytes=0-9,20-29'],
    ['items=0-9'],
    ['bytes=1.5-3'],
    ['bytes=-1-5'],
    ['bytes=0-99999999999999999999'],
    ['0-99'],
    ['bytes 0-99'],
  ])('rejects %j', (header) => {
    expect(parseRange(header, 1000)).toBeNull();
  });

  it('rejects every range of an empty file and of a size that is not a count', () => {
    expect(parseRange('bytes=0-9', 0)).toBeNull();
    expect(parseRange('bytes=0-9', Number.NaN)).toBeNull();
  });
});

describe('splitPath', () => {
  it('returns the decoded segments of a clean path', () => {
    expect(splitPath('/')).toEqual([]);
    expect(splitPath('/wardos/assets/app.js?v=3#top')).toEqual(['wardos', 'assets', 'app.js']);
    expect(splitPath('/a%20b/%C3%A9.png')).toEqual(['a b', 'é.png']);
  });

  it('drops empty and single-dot segments', () => {
    expect(splitPath('//wardos///x.js')).toEqual(['wardos', 'x.js']);
    expect(splitPath('/wardos/./x.js')).toEqual(['wardos', 'x.js']);
    expect(splitPath('/.')).toEqual([]);
  });

  it('returns null for anything that is not a plain absolute path', () => {
    for (const bad of ['', 'wardos/x.js', '*', 'http://example.test/x', '?q=1']) {
      expect(splitPath(bad), bad).toBeNull();
    }
  });
});

const mounts = [
  { prefix: '/wardos/', dir: '/srv/wardos' },
  { prefix: '/red-light-green-light-cv/', dir: '/srv/rlgl' },
  { prefix: '/', dir: '/srv/docs' },
];

describe('mountFor', () => {
  it('mountFor routes /wardos/x.js to the wardos docs and / to docs', () => {
    expect(mountFor('/wardos/x.js', mounts)).toEqual({ dir: '/srv/wardos', rel: 'x.js' });
    expect(mountFor('/', mounts)).toEqual({ dir: '/srv/docs', rel: '' });
  });

  it('keeps the path inside the mount in rel, and leaves other paths to the root mount', () => {
    expect(mountFor('/wardos/assets/app.js', mounts)).toEqual({ dir: '/srv/wardos', rel: 'assets/app.js' });
    expect(mountFor('/red-light-green-light-cv/demo.mp4', mounts)).toEqual({ dir: '/srv/rlgl', rel: 'demo.mp4' });
    expect(mountFor('/work/wardos/loop.mp4', mounts)).toEqual({ dir: '/srv/docs', rel: 'work/wardos/loop.mp4' });
    expect(mountFor('/index.html', mounts)).toEqual({ dir: '/srv/docs', rel: 'index.html' });
  });

  it('gives an empty rel for the mount directory itself, with or without the slash', () => {
    expect(mountFor('/wardos/', mounts)).toEqual({ dir: '/srv/wardos', rel: '' });
    expect(mountFor('/wardos', mounts)).toEqual({ dir: '/srv/wardos', rel: '' });
  });

  it('does not match a sibling that only shares the first letters', () => {
    expect(mountFor('/wardos-extra/x.js', mounts)).toEqual({ dir: '/srv/docs', rel: 'wardos-extra/x.js' });
    expect(mountFor('/Wardos/x.js', mounts)).toEqual({ dir: '/srv/docs', rel: 'Wardos/x.js' });
  });

  it('prefers the longest prefix', () => {
    const nested = [
      { prefix: '/', dir: '/srv/docs' },
      { prefix: '/lab/', dir: '/srv/lab' },
      { prefix: '/lab/demo/', dir: '/srv/demo' },
    ];
    expect(mountFor('/lab/demo/a.js', nested)).toEqual({ dir: '/srv/demo', rel: 'a.js' });
    expect(mountFor('/lab/b.js', nested)).toEqual({ dir: '/srv/lab', rel: 'b.js' });
  });

  it('decodes escapes, ignores the query string and collapses repeated slashes', () => {
    expect(mountFor('/wardos/my%20file.png?v=2', mounts)).toEqual({ dir: '/srv/wardos', rel: 'my file.png' });
    expect(mountFor('//wardos///a//b.js', mounts)).toEqual({ dir: '/srv/wardos', rel: 'a/b.js' });
  });

  it.each([
    ['/wardos/../secret.txt'],
    ['/../secret.txt'],
    ['/wardos/a/../../secret.txt'],
    ['/wardos/%2e%2e/secret.txt'],
    ['/wardos/%2E%2E/secret.txt'],
    ['/wardos/.%2e/secret.txt'],
    ['/wardos/..%2fsecret.txt'],
    ['/wardos/..%5csecret.txt'],
    ['/wardos/..\\secret.txt'],
    ['/wardos/a%2Fb.js'],
    ['/wardos/x.js%00.png'],
    ['/wardos/%E0%A4%A'],
  ])('rejects %s', (urlPath) => {
    expect(mountFor(urlPath, mounts)).toBeNull();
  });

  it('returns null for a path that is not absolute', () => {
    expect(mountFor('wardos/x.js', mounts)).toBeNull();
    expect(mountFor('', mounts)).toBeNull();
  });

  it('returns null when no mount matches', () => {
    expect(mountFor('/carmine/', mounts.slice(0, 2))).toBeNull();
    expect(mountFor('/', [])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Real requests
// ---------------------------------------------------------------------------

type Reply = { status: number; headers: http.IncomingHttpHeaders; body: Buffer };

function call(
  port: number,
  target: string,
  init: { method?: string; headers?: http.OutgoingHttpHeaders; body?: string } = {},
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    // The raw request target is sent as given: no normalisation happens on this side.
    const req = http.request(
      { host: '127.0.0.1', port, path: target, method: init.method ?? 'GET', headers: init.headers, agent: false },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    req.end(init.body);
  });
}

function listen(server: net.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve((server.address() as net.AddressInfo).port));
  });
}

function stop(server: net.Server): Promise<void> {
  return new Promise((resolve) => {
    if (server instanceof http.Server) server.closeAllConnections();
    server.close(() => resolve());
  });
}

function put(file: string, data: string | Buffer): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
}

// The site's build output is rewritten whenever the site is rebuilt, so a comparison with
// a file under docs/ reads it on both sides of the request and tries again until a read
// is stable and the page matches it.
async function expectServedFromDisk(port: number, urlPath: string, file: string): Promise<void> {
  let last = 'no attempt made';
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const before = fs.readFileSync(file);
      const reply = await call(port, urlPath);
      const after = fs.readFileSync(file);
      if (before.equals(after)) {
        if (reply.status === 200 && reply.body.equals(before)) return;
        last = `status ${reply.status}, ${reply.body.length} bytes served, ${before.length} on disk`;
      }
    } catch (error) {
      last = String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`${urlPath} never matched ${file}: ${last}`);
}

const clip = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 251));
const portfolioClip = Buffer.from(Array.from({ length: 800 }, (_, i) => (i * 3) % 247));
const big = Buffer.from(Array.from({ length: 300_000 }, (_, i) => (i * 31 + (i >> 8)) & 255));
const notes = Buffer.from('n'.repeat(300));

let tree: string;
let secretPath: string;
let projectMounts: { prefix: string; dir: string }[];

beforeAll(() => {
  tree = fs.mkdtempSync(path.join(os.tmpdir(), 'replica-'));
  secretPath = path.join(tree, 'secret.txt');
  put(secretPath, 'outside every mount');

  const site = path.join(tree, 'site');
  put(path.join(site, 'index.html'), '<h1>portfolio</h1>');
  put(path.join(site, '404.html'), '<h1>portfolio: not found</h1>');
  put(path.join(site, 'app.js'), 'console.log("portfolio");');
  put(path.join(site, 'page.html'), '<h1>a page</h1>');
  put(path.join(site, 'sub', 'index.html'), 'sub index');
  fs.mkdirSync(path.join(site, 'bare'), { recursive: true });
  put(path.join(site, 'odd', 'index.html', 'inner.txt'), 'a folder that happens to be called index.html');
  put(path.join(site, 'work', 'wardos', 'loop.mp4'), portfolioClip);

  const wardos = path.join(tree, 'wardos');
  put(path.join(wardos, 'index.html'), '<h1>wardos</h1>');
  put(path.join(wardos, 'x.js'), 'export const wardos = 1;');
  put(path.join(wardos, 'guide.html'), '<h1>guide</h1>');
  put(path.join(wardos, 'assets', 'app.css'), 'body{margin:0}');
  put(path.join(wardos, 'sql-wasm.wasm'), Buffer.from([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0]));
  put(path.join(wardos, 'model.onnx'), Buffer.from([8, 9, 10]));
  put(path.join(wardos, 'blob.xyz'), 'unknown kind');
  put(path.join(wardos, 'my file.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  put(path.join(wardos, 'notes.txt'), notes);
  put(path.join(wardos, 'clip.mp4'), clip);
  put(path.join(wardos, 'big.webm'), big);

  put(path.join(tree, 'carmine', 'index.html'), '<h1>carmine</h1>');

  projectMounts = [
    { prefix: '/wardos/', dir: path.join(tree, 'wardos') },
    { prefix: '/carmine/', dir: path.join(tree, 'carmine') },
  ];
});

afterAll(() => {
  fs.rmSync(tree, { recursive: true, force: true });
});

describe('replica server', () => {
  let server: http.Server;
  let port: number;

  beforeAll(async () => {
    server = createReplica({ mounts: [...projectMounts, { prefix: '/', dir: path.join(tree, 'site') }] });
    port = await listen(server);
  });
  afterAll(() => stop(server));

  it('serves the portfolio at / and each project at /<repo>/', async () => {
    const root = await call(port, '/');
    expect(root.status).toBe(200);
    expect(root.body.toString()).toBe('<h1>portfolio</h1>');

    expect((await call(port, '/index.html')).body.toString()).toBe('<h1>portfolio</h1>');
    expect((await call(port, '/wardos/')).body.toString()).toBe('<h1>wardos</h1>');
    expect((await call(port, '/carmine/')).body.toString()).toBe('<h1>carmine</h1>');
    expect((await call(port, '/wardos/x.js')).body.toString()).toBe('export const wardos = 1;');
  });

  it('sends type, exact length and no-cache with each file', async () => {
    const page = await call(port, '/wardos/');
    expect(page.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(page.headers['content-length']).toBe(String(Buffer.byteLength('<h1>wardos</h1>')));
    expect(page.headers['cache-control']).toBe('no-cache');

    expect((await call(port, '/wardos/x.js')).headers['content-type']).toBe('application/javascript; charset=utf-8');
    expect((await call(port, '/wardos/assets/app.css')).headers['content-type']).toBe('text/css; charset=utf-8');
    expect((await call(port, '/wardos/sql-wasm.wasm')).headers['content-type']).toBe('application/wasm');
    expect((await call(port, '/wardos/model.onnx')).headers['content-type']).toBe('application/octet-stream');
    expect((await call(port, '/wardos/blob.xyz')).headers['content-type']).toBe('application/octet-stream');
  });

  it('decodes escaped file names', async () => {
    const png = await call(port, '/wardos/my%20file.png');
    expect(png.status).toBe(200);
    expect(png.headers['content-type']).toBe('image/png');
  });

  it('answers HEAD with the headers of a GET and no body', async () => {
    const head = await call(port, '/wardos/x.js', { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(head.headers['content-length']).toBe(String(Buffer.byteLength('export const wardos = 1;')));
    expect(head.headers['content-type']).toBe('application/javascript; charset=utf-8');
    expect(head.body.length).toBe(0);
  });

  it('sends a mount directory without its slash to the slash form, keeping the query string', async () => {
    const bare = await call(port, '/wardos');
    expect(bare.status).toBe(301);
    expect(bare.headers.location).toBe('/wardos/');
    expect(bare.headers['cache-control']).toBe('no-cache');

    expect((await call(port, '/wardos?tab=2')).headers.location).toBe('/wardos/?tab=2');
    expect((await call(port, '/wardos/assets')).headers.location).toBe('/wardos/assets/');
    expect((await call(port, '/sub')).headers.location).toBe('/sub/');
  });

  it('never redirects to another host, whatever the path starts with', async () => {
    expect((await call(port, '//sub')).headers.location).toBe('/sub/');
    expect((await call(port, '/.')).headers.location).toBe('/');
    expect((await call(port, '//wardos')).headers.location).toBe('/wardos/');
  });

  it('serves index.html for nested directories and 404s a directory without one', async () => {
    const sub = await call(port, '/sub/');
    expect(sub.status).toBe(200);
    expect(sub.body.toString()).toBe('sub index');

    expect((await call(port, '/bare/')).status).toBe(404);
    expect((await call(port, '/odd/')).status).toBe(404);
    expect((await call(port, '/wardos/assets/')).status).toBe(404);
  });

  it('404s a file requested with a trailing slash', async () => {
    expect((await call(port, '/wardos/x.js/')).status).toBe(404);
  });

  it('answers /name from name.html when that is the only match, as GitHub Pages does', async () => {
    const page = await call(port, '/page');
    expect(page.status).toBe(200);
    expect(page.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(page.body.toString()).toBe('<h1>a page</h1>');
    expect((await call(port, '/wardos/guide')).body.toString()).toBe('<h1>guide</h1>');

    expect((await call(port, '/page/')).status).toBe(404);
    expect((await call(port, '/page.html/')).status).toBe(404);
    expect((await call(port, '/missing')).status).toBe(404);
    expect((await call(port, '/wardos/missing')).status).toBe(404);
  });

  it('serves byte ranges of mp4 and webm files with 206', async () => {
    const first = await call(port, '/wardos/clip.mp4', { headers: { Range: 'bytes=0-99' } });
    expect(first.status).toBe(206);
    expect(first.headers['content-range']).toBe('bytes 0-99/1000');
    expect(first.headers['content-length']).toBe('100');
    expect(first.headers['accept-ranges']).toBe('bytes');
    expect(first.headers['content-type']).toBe('video/mp4');
    expect(first.body.equals(clip.subarray(0, 100))).toBe(true);

    const rest = await call(port, '/wardos/clip.mp4', { headers: { Range: 'bytes=900-' } });
    expect(rest.status).toBe(206);
    expect(rest.headers['content-range']).toBe('bytes 900-999/1000');
    expect(rest.body.equals(clip.subarray(900))).toBe(true);

    const tail = await call(port, '/wardos/clip.mp4', { headers: { Range: 'bytes=-50' } });
    expect(tail.headers['content-range']).toBe('bytes 950-999/1000');
    expect(tail.body.equals(clip.subarray(950))).toBe(true);

    const clamped = await call(port, '/wardos/clip.mp4', { headers: { Range: 'bytes=990-5000' } });
    expect(clamped.headers['content-range']).toBe('bytes 990-999/1000');

    const webm = await call(port, '/wardos/big.webm', { headers: { Range: 'bytes=70000-140000' } });
    expect(webm.status).toBe(206);
    expect(webm.headers['content-type']).toBe('video/webm');
    expect(webm.headers['content-range']).toBe('bytes 70000-140000/300000');
    expect(webm.body.equals(big.subarray(70000, 140001))).toBe(true);
  });

  it('serves a whole video with 200 and says that ranges are accepted', async () => {
    const whole = await call(port, '/wardos/big.webm');
    expect(whole.status).toBe(200);
    expect(whole.headers['accept-ranges']).toBe('bytes');
    expect(whole.headers['content-length']).toBe('300000');
    expect(whole.body.equals(big)).toBe(true);
  });

  it('serves ranges of a video in a mount the same way as in the root', async () => {
    const reply = await call(port, '/work/wardos/loop.mp4', { headers: { Range: 'bytes=0-99' } });
    expect(reply.status).toBe(206);
    expect(reply.headers['content-range']).toBe('bytes 0-99/800');
    expect(reply.body.equals(portfolioClip.subarray(0, 100))).toBe(true);
  });

  it('answers 416 with the size when a range cannot be served', async () => {
    for (const range of ['bytes=1000-', 'bytes=5-1', 'bytes=abc', 'bytes=0-9,20-29']) {
      const reply = await call(port, '/wardos/clip.mp4', { headers: { Range: range } });
      expect(reply.status, range).toBe(416);
      expect(reply.headers['content-range'], range).toBe('bytes */1000');
    }
  });

  it('ignores Range for other files', async () => {
    const reply = await call(port, '/wardos/notes.txt', { headers: { Range: 'bytes=0-9' } });
    expect(reply.status).toBe(200);
    expect(reply.headers['content-range']).toBeUndefined();
    expect(reply.headers['content-length']).toBe('300');
    expect(reply.body.equals(notes)).toBe(true);
  });

  it("serves the mount's own 404 page with a 404 status, or plain text when it has none", async () => {
    const page = await call(port, '/missing.js');
    expect(page.status).toBe(404);
    expect(page.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(page.body.toString()).toBe('<h1>portfolio: not found</h1>');

    const plain = await call(port, '/wardos/missing');
    expect(plain.status).toBe(404);
    expect(plain.headers['content-type']).toBe('text/plain; charset=utf-8');

    const head = await call(port, '/missing.js', { method: 'HEAD' });
    expect(head.status).toBe(404);
    expect(head.body.length).toBe(0);
  });

  it('never leaves a mount', async () => {
    const attempts = [
      '/wardos/../secret.txt',
      '/wardos/../../secret.txt',
      '/../secret.txt',
      '/site/../secret.txt',
      '/%2e%2e/secret.txt',
      '/wardos/%2e%2e/secret.txt',
      '/wardos/%2E%2E%2Fsecret.txt',
      '/wardos/..%2fsecret.txt',
      '/wardos/..%5csecret.txt',
      '/wardos/..\\secret.txt',
      '/wardos/%00',
      '/wardos/%E0%A4%A',
    ];
    expect(fs.readFileSync(secretPath, 'utf8')).toBe('outside every mount');
    for (const attempt of attempts) {
      const reply = await call(port, attempt);
      expect(reply.status, attempt).toBe(400);
      expect(reply.body.toString(), attempt).not.toContain('outside every mount');
    }
  });

  it('accepts GET and HEAD only', async () => {
    const reply = await call(port, '/wardos/x.js', { method: 'POST', body: 'x' });
    expect(reply.status).toBe(405);
    expect(reply.headers.allow).toBe('GET, HEAD');
  });
});

describe('replica server in proxy mode', () => {
  let upstream: http.Server;
  let upstreamPort: number;
  let front: http.Server;
  let frontPort: number;

  beforeAll(async () => {
    upstream = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        res.writeHead(202, { 'Content-Type': 'application/json', 'X-From': 'upstream' });
        res.end(
          JSON.stringify({
            method: req.method,
            url: req.url,
            host: req.headers.host,
            body: Buffer.concat(chunks).toString(),
          }),
        );
      });
    });
    upstreamPort = await listen(upstream);
    front = createReplica({ mounts: projectMounts, proxy: `http://127.0.0.1:${upstreamPort}` });
    frontPort = await listen(front);
  });
  afterAll(async () => {
    await stop(front);
    await stop(upstream);
  });

  it('forwards requests that match no project mount, with path, query and status intact', async () => {
    const reply = await call(frontPort, '/blog/post?draft=1');
    expect(reply.status).toBe(202);
    expect(reply.headers['x-from']).toBe('upstream');
    expect(JSON.parse(reply.body.toString())).toMatchObject({ method: 'GET', url: '/blog/post?draft=1' });

    const root = await call(frontPort, '/');
    expect(JSON.parse(root.body.toString())).toMatchObject({ url: '/' });
  });

  it('forwards the method and body, and keeps the Host the browser used', async () => {
    const reply = await call(frontPort, '/api/echo', {
      method: 'POST',
      body: 'hello',
      headers: { 'Content-Type': 'text/plain' },
    });
    expect(JSON.parse(reply.body.toString())).toEqual({
      method: 'POST',
      url: '/api/echo',
      host: `127.0.0.1:${frontPort}`,
      body: 'hello',
    });
  });

  it('still serves project mounts from disk instead of forwarding them', async () => {
    const reply = await call(frontPort, '/wardos/x.js');
    expect(reply.status).toBe(200);
    expect(reply.headers['x-from']).toBeUndefined();
    expect(reply.body.toString()).toBe('export const wardos = 1;');

    const bare = await call(frontPort, '/wardos');
    expect(bare.status).toBe(301);
    expect(bare.headers.location).toBe('/wardos/');
  });

  it('answers 502 when the target hangs up, and keeps serving afterwards', async () => {
    const rude = http.createServer((req) => req.socket.destroy());
    const rudePort = await listen(rude);
    const relay = createReplica({ mounts: projectMounts, proxy: `http://127.0.0.1:${rudePort}` });
    const relayPort = await listen(relay);
    try {
      expect((await call(relayPort, '/anything')).status).toBe(502);
      expect((await call(relayPort, '/wardos/x.js')).status).toBe(200);
      expect((await call(relayPort, '/anything-else')).status).toBe(502);
    } finally {
      await stop(relay);
      await stop(rude);
    }
  });

  it('answers 502 and names the target when it cannot be reached', async () => {
    const closed = http.createServer();
    const closedPort = await listen(closed);
    await stop(closed);

    const lonely = createReplica({ mounts: projectMounts, proxy: `http://127.0.0.1:${closedPort}` });
    const lonelyPort = await listen(lonely);
    try {
      const reply = await call(lonelyPort, '/anything');
      expect(reply.status).toBe(502);
      expect(reply.body.toString()).toContain(`http://127.0.0.1:${closedPort}`);
    } finally {
      await stop(lonely);
    }
  });
});

// ---------------------------------------------------------------------------
// The command line
// ---------------------------------------------------------------------------

describe('serve.mjs', () => {
  const children: ChildProcess[] = [];

  afterEach(() => {
    for (const child of children.splice(0)) child.kill('SIGKILL');
  });

  function run(args: string[]) {
    const child = spawn(process.execPath, [serveScript, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    children.push(child);
    let out = '';
    let err = '';
    const line = new Promise<string>((resolve, reject) => {
      child.stdout!.on('data', (chunk: Buffer) => {
        out += chunk;
        const end = out.indexOf('\n');
        if (end >= 0) resolve(out.slice(0, end));
      });
      child.once('exit', () => reject(new Error(`exited before it was listening: ${err}`)));
    });
    line.catch(() => {});
    child.stderr!.on('data', (chunk: Buffer) => {
      err += chunk;
    });
    const exited = new Promise<{ code: number | null; out: string; err: string }>((resolve) => {
      child.once('exit', (code) => resolve({ code, out, err }));
    });
    return { child, line, exited, output: () => out };
  }

  const portOf = (line: string) => Number(/http:\/\/127\.0\.0\.1:(\d+)/.exec(line)?.[1]);

  it('prints one line with the port and every mount, then serves docs/', { timeout: 20_000 }, async () => {
    const server = run(['--port', '0']);
    const line = await server.line;
    const port = portOf(line);
    expect(port).toBeGreaterThan(0);

    expect(line).toContain('/ -> docs');
    expect(line).toContain('/homecast/ -> ../1-homecast/docs');
    expect(line).toContain('/nightingale/ -> ../2-nightingale/docs');
    expect(line).toContain('/red-light-green-light-cv/ -> ../3-red-light-green-light-cv/docs');
    expect(line).toContain('/wardos/ -> ../4-wardos/docs');
    expect(line).toContain('/carmine/ -> ../5-carmine/docs');
    expect(line).toContain('/trafficlens/ -> ../6-trafficlens/docs');

    await expectServedFromDisk(port, '/', path.join(repoRoot, 'docs', 'index.html'));
    expect(server.output().trimEnd().split('\n')).toHaveLength(1);
  });

  it('with --proxy, names the target and forwards what no mount owns', { timeout: 20_000 }, async () => {
    const upstream = http.createServer((req, res) => res.end(`upstream ${req.url}`));
    const upstreamPort = await listen(upstream);
    try {
      const server = run(['--port', '0', '--proxy', `http://127.0.0.1:${upstreamPort}`]);
      const line = await server.line;
      expect(line).toContain(`/ -> proxy http://127.0.0.1:${upstreamPort}`);
      expect(line).not.toContain('/ -> docs');
      expect(line).toContain('/wardos/ -> ../4-wardos/docs');

      const reply = await call(portOf(line), '/dev/page');
      expect(reply.body.toString()).toBe('upstream /dev/page');
    } finally {
      await stop(upstream);
    }
  });

  it('exits 1 with a clear message when the port is taken', { timeout: 20_000 }, async () => {
    const blocker = net.createServer();
    const taken = await listen(blocker);
    try {
      const result = await run(['--port', String(taken)]).exited;
      expect(result.code).toBe(1);
      expect(result.err).toContain(String(taken));
      expect(result.err).toMatch(/already in use/i);
    } finally {
      await stop(blocker);
    }
  });

  it.each([
    [['--port', 'abc'], /--port/],
    [['--port', '70000'], /--port/],
    [['--proxy', 'not a url'], /--proxy/],
    [['--proxy', 'ftp://127.0.0.1:21'], /--proxy/],
    [['--nope'], /usage/i],
  ])('exits 2 and prints the usage for %j', { timeout: 20_000 }, async (args, message) => {
    const result = await run(args).exited;
    expect(result.code).toBe(2);
    expect(result.err).toMatch(message);
    expect(result.err).toMatch(/usage/i);
  });

  it('prints the usage and exits 0 for --help', { timeout: 20_000 }, async () => {
    const result = await run(['--help']).exited;
    expect(result.code).toBe(0);
    expect(result.out).toMatch(/usage/i);
  });
});
