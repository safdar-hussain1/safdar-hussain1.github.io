// Helpers and a request handler for serving several built sites from one local
// port, laid out the way GitHub Pages lays them out online: the portfolio at "/"
// and each project's own site under "/<repo>/". With one origin a project can sit
// in a frame and share storage and scripting access with the page around it,
// exactly as it does on the live site.

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { pipeline } from 'node:stream';

/** @typedef {{ prefix: string, dir: string }} Mount */

const OCTET_STREAM = 'application/octet-stream';

// The types GitHub Pages sends for these files, so a page behaves the same here as
// online. A Map, not an object: "constructor" or "__proto__" must not read as an
// extension that has a type.
const MIME_TYPES = new Map([
  ['html', 'text/html; charset=utf-8'],
  ['js', 'application/javascript; charset=utf-8'],
  ['mjs', 'text/javascript; charset=utf-8'],
  ['css', 'text/css; charset=utf-8'],
  ['json', 'application/json; charset=utf-8'],
  ['wasm', 'application/wasm'],
  ['onnx', OCTET_STREAM],
  ['task', OCTET_STREAM],
  ['db', OCTET_STREAM],
  ['png', 'image/png'],
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['webp', 'image/webp'],
  ['svg', 'image/svg+xml'],
  ['ico', 'image/x-icon'],
  ['woff2', 'font/woff2'],
  ['webm', 'video/webm'],
  ['mp4', 'video/mp4'],
  ['txt', 'text/plain; charset=utf-8'],
  ['md', 'text/markdown; charset=utf-8'],
  ['xml', 'application/xml'],
]);

// Browsers need byte ranges to seek in a video, and Safari will not play one
// without them. Everything else the sites ship is sent whole.
const RANGE_EXTENSIONS = new Set(['.mp4', '.webm']);

// Headers that describe one hop of a connection, not the message, so a proxy must
// not copy them from one side to the other.
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
]);

/**
 * Content type for a file, chosen by its extension; anything unknown is a download.
 * @param {string} filePath
 * @returns {string}
 */
export function mimeFor(filePath) {
  const extension = path.extname(filePath).slice(1).toLowerCase();
  return MIME_TYPES.get(extension) ?? OCTET_STREAM;
}

/**
 * Reads one `Range` header against a file of `size` bytes.
 *
 * Understands `bytes=a-b`, `bytes=a-` and `bytes=-n` (the last n bytes). The end is
 * inclusive and clamped to the last byte. Returns null for anything that cannot be
 * answered with a single slice of the file: other units, several ranges, a
 * reversed or malformed range, a start past the end, or an empty file.
 *
 * @param {string | null | undefined} header
 * @param {number} size
 * @returns {{ start: number, end: number } | null}
 */
export function parseRange(header, size) {
  if (typeof header !== 'string' || !Number.isSafeInteger(size) || size <= 0) return null;
  const match = /^\s*bytes\s*=\s*(\d*)\s*-\s*(\d*)\s*$/i.exec(header);
  if (!match) return null;
  const [, first, last] = match;

  if (first === '') {
    const length = Number(last);
    if (last === '' || !Number.isSafeInteger(length) || length === 0) return null;
    return { start: Math.max(0, size - length), end: size - 1 };
  }

  const start = Number(first);
  const end = last === '' ? size - 1 : Number(last);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return null;
  if (start > end || start >= size) return null;
  return { start, end: Math.min(end, size - 1) };
}

/** The path of a request target, without its query string or fragment. */
function pathnameOf(url) {
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}

/**
 * Splits a request target into clean, decoded path segments.
 *
 * Returns null when the target is not an absolute path or could reach outside the
 * tree it is looked up in: a ".." segment, a backslash, a NUL byte, an escape that
 * decodes to a separator, or a broken escape. Each segment is decoded on its own
 * after the split, so "%2F" never acts as a separator, and ".." is refused rather
 * than resolved, so a hand-written path cannot climb out of a mount. Empty and "."
 * segments are dropped.
 *
 * @param {string} urlPath
 * @returns {string[] | null}
 */
export function splitPath(urlPath) {
  if (typeof urlPath !== 'string' || !urlPath.startsWith('/')) return null;
  const segments = [];
  for (const raw of pathnameOf(urlPath).split('/')) {
    if (raw === '') continue;
    let segment;
    try {
      segment = decodeURIComponent(raw);
    } catch {
      return null;
    }
    if (segment === '..' || /[\\/\0]/.test(segment)) return null;
    if (segment !== '.') segments.push(segment);
  }
  return segments;
}

/** The mount whose prefix covers the most leading segments, with the rest as `rel`. */
function matchMount(segments, mounts) {
  let best = null;
  let bestDepth = -1;
  for (const mount of mounts) {
    const prefix = mount.prefix.split('/').filter(Boolean);
    if (prefix.length <= bestDepth || prefix.length > segments.length) continue;
    if (prefix.every((part, index) => part === segments[index])) {
      best = mount;
      bestDepth = prefix.length;
    }
  }
  return best && { dir: best.dir, rel: segments.slice(bestDepth).join('/') };
}

/**
 * Finds which mount serves a request path.
 *
 * `rel` is the decoded path inside the mount, with no leading or trailing slash and
 * '' for the mount's own directory. A mount's directory is reached with or without
 * its trailing slash; the server turns the slash-less form into a redirect, as the
 * live site does. Returns null when no mount covers the path or the path is
 * refused by `splitPath`.
 *
 * @param {string} urlPath
 * @param {Mount[]} mounts
 * @returns {{ dir: string, rel: string } | null}
 */
export function mountFor(urlPath, mounts) {
  const segments = splitPath(urlPath);
  return segments && matchMount(segments, mounts);
}

/**
 * Builds the server (not yet listening). Requests are answered from the mounts;
 * with `proxy`, a request that no mount covers is passed to that address instead,
 * which is how a dev server for the portfolio can run next to the project sites.
 *
 * @param {{ mounts: Mount[], proxy?: URL | string | null }} options
 * @returns {import('node:http').Server}
 */
export function createReplica({ mounts, proxy = null }) {
  const roots = mounts.map((mount) => ({ prefix: mount.prefix, dir: path.resolve(mount.dir) }));
  const target = proxy ? new URL(proxy) : null;
  return http.createServer((req, res) => {
    handle(req, res, roots, target).catch((error) => {
      console.error(error);
      if (res.headersSent) res.destroy();
      else reply(res, 500, 'Internal server error');
    });
  });
}

async function handle(req, res, mounts, proxy) {
  const url = req.url ?? '/';
  const segments = splitPath(url);
  const mount = segments && matchMount(segments, mounts);

  if (!mount) {
    if (proxy) return forward(req, res, proxy);
    return segments ? reply(res, 404, 'Not found') : reply(res, 400, 'Bad request');
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return reply(res, 405, 'Method not allowed', { Allow: 'GET, HEAD' });
  }

  const found = await locate(mount.dir, mount.rel, pathnameOf(url).endsWith('/'));
  if (found.file) return sendFile(req, res, found.file, found.size);
  if (found.redirect) {
    // Built from the cleaned segments, never from the raw target, so a path such as
    // "//example.test" cannot turn into a redirect to another host. The query string
    // is kept only when it is plain printable text.
    const query = url.includes('?') ? url.slice(url.indexOf('?')) : '';
    const location = segments.length ? `/${segments.map(encodeURIComponent).join('/')}/` : '/';
    return reply(res, 301, `Moved to ${location}`, {
      Location: location + (/^\?[\x21-\x7e]*$/.test(query) ? query : ''),
    });
  }
  return notFound(req, res, mount.dir);
}

/**
 * Resolves a path inside a mount to a file. A directory needs the trailing slash
 * (without it, the browser would resolve relative links against the wrong folder, so
 * the caller redirects) and is answered by its index.html; there is no listing.
 * Like GitHub Pages, "/name" is answered from name.html when that is the only match.
 */
async function locate(dir, rel, trailingSlash) {
  const missing = { file: null, redirect: false };
  const target = path.join(dir, rel);
  if (target !== dir && !target.startsWith(dir + path.sep)) return missing;

  const info = await statOrNull(target);
  if (!info) {
    const page = rel && !trailingSlash ? await statOrNull(`${target}.html`) : null;
    return page?.isFile() ? { file: `${target}.html`, size: page.size, redirect: false } : missing;
  }
  if (info.isDirectory()) {
    if (!trailingSlash) return { file: null, redirect: true };
    const index = path.join(target, 'index.html');
    const indexInfo = await statOrNull(index);
    return indexInfo?.isFile() ? { file: index, size: indexInfo.size, redirect: false } : missing;
  }
  if (info.isFile() && !trailingSlash) return { file: target, size: info.size, redirect: false };
  return missing;
}

async function statOrNull(file) {
  try {
    return await stat(file);
  } catch (error) {
    if (['ENOENT', 'ENOTDIR', 'ENAMETOOLONG'].includes(error.code)) return null;
    throw error;
  }
}

function sendFile(req, res, file, size, status = 200) {
  const headers = { 'Content-Type': mimeFor(file), 'Cache-Control': 'no-cache' };
  let start = 0;
  let end = size - 1;

  if (RANGE_EXTENSIONS.has(path.extname(file).toLowerCase())) {
    headers['Accept-Ranges'] = 'bytes';
    if (status === 200 && req.headers.range) {
      const range = parseRange(req.headers.range, size);
      if (!range) {
        res.writeHead(416, { ...headers, 'Content-Range': `bytes */${size}`, 'Content-Length': 0 });
        return res.end();
      }
      ({ start, end } = range);
      status = 206;
      headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
    }
  }

  headers['Content-Length'] = end - start + 1;
  res.writeHead(status, headers);
  if (req.method === 'HEAD' || size === 0) return res.end();
  pipeline(createReadStream(file, { start, end }), res, ignore);
}

/** The mount's own 404.html when it has one, as GitHub Pages does, else plain text. */
async function notFound(req, res, dir) {
  const page = path.join(dir, '404.html');
  const info = await statOrNull(page);
  if (info?.isFile()) return sendFile(req, res, page, info.size, 404);
  return reply(res, 404, 'Not found');
}

function reply(res, status, text, extra = {}) {
  const body = `${text}\n`;
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-cache',
    ...extra,
  });
  res.end(body);
}

/**
 * Passes a request to the proxy target and streams the answer back. The browser's own
 * Host header is kept, so the target sees the same origin the page was loaded from.
 * A fresh connection per request means a restarted target never leaves a stale
 * socket behind.
 */
function forward(req, res, target) {
  const upstream = http.request(
    {
      hostname: target.hostname.replace(/^\[|\]$/g, ''),
      port: target.port || 80,
      method: req.method,
      path: req.url,
      headers: withoutHopByHop(req.headers),
      agent: false,
    },
    (answer) => {
      res.writeHead(answer.statusCode ?? 502, answer.statusMessage || undefined, withoutHopByHop(answer.headers));
      pipeline(answer, res, ignore);
    },
  );
  // The pipeline below calls back only once, and the target can still refuse the
  // connection or hang up after the request was written, so the reply to the browser
  // is decided here.
  upstream.on('error', (error) => {
    if (res.headersSent) res.destroy();
    else reply(res, 502, `Cannot reach ${target.origin} (${error.code ?? error.message}). Is the dev server running?`);
  });
  pipeline(req, upstream, ignore);
}

function withoutHopByHop(headers) {
  return Object.fromEntries(Object.entries(headers).filter(([name]) => !HOP_BY_HOP.has(name)));
}

function ignore() {}
