// Runs a local copy of the live origin:
//
//   node scripts/serve.mjs [--port 4300] [--proxy http://127.0.0.1:4321]
//
// On GitHub Pages the portfolio and every project share one origin, so the page
// can dock a project in a frame with no cross-origin restrictions. This script
// reproduces that on one local port: this repo's docs/ at "/" and each project's
// built site (the docs/ folder inside the project's own folder, beside this repo) at
// "/<repo>/". With --proxy the portfolio's own pages come from that address instead
// (an `astro dev` server) while the project sites are still served from disk.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createReplica } from './lib/static.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Loopback only: the server exposes the sibling project folders (and, with --proxy,
// a dev server), so it should not be reachable from the network.
const HOST = '127.0.0.1';

// Public repo name -> the folder beside this one that holds the project's built site.
const PROJECTS = [
  ['homecast', '1-homecast'],
  ['nightingale', '2-nightingale'],
  ['red-light-green-light-cv', '3-red-light-green-light-cv'],
  ['wardos', '4-wardos'],
  ['carmine', '5-carmine'],
  ['trafficlens', '6-trafficlens'],
];

const USAGE = `Usage: node scripts/serve.mjs [--port 4300] [--proxy http://127.0.0.1:4321]

  --port N     listen on ${HOST}:N (default 4300; 0 picks a free port)
  --proxy URL  send requests that no project owns to URL, such as an astro dev
               server, instead of serving docs/ at /
  --help       show this text`;

class UsageError extends Error {}

function readOptions(argv) {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        port: { type: 'string' },
        proxy: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
    }));
  } catch (error) {
    throw new UsageError(error.message);
  }

  const portText = values.port ?? '4300';
  const port = Number(portText);
  if (!/^\d+$/.test(portText) || port > 65535) {
    throw new UsageError(`--port must be a whole number from 0 to 65535, not "${portText}"`);
  }

  let proxy = null;
  if (values.proxy !== undefined) {
    try {
      proxy = new URL(values.proxy);
    } catch {
      throw new UsageError(`--proxy must be an http:// address such as http://127.0.0.1:4321, not "${values.proxy}"`);
    }
    if (proxy.protocol !== 'http:' || proxy.pathname !== '/' || proxy.search || proxy.hash) {
      throw new UsageError(`--proxy must be an http:// address without a path, such as http://127.0.0.1:4321, not "${values.proxy}"`);
    }
  }
  return { port, proxy, help: Boolean(values.help) };
}

function projectMounts() {
  return PROJECTS.map(([repo, folder]) => ({
    prefix: `/${repo}/`,
    dir: path.resolve(repoRoot, '..', folder, 'docs'),
  }));
}

function startupLine(port, mounts, proxy) {
  const root = proxy ? `/ -> proxy ${proxy.origin}` : '/ -> docs';
  const entries = mounts
    .filter((mount) => mount.prefix !== '/')
    .map((mount) => {
      const missing = fs.existsSync(mount.dir) ? '' : ' (not found)';
      return `${mount.prefix} -> ${path.relative(repoRoot, mount.dir)}${missing}`;
    });
  return `Serving http://${HOST}:${port}  ${[root, ...entries].join('  ')}`;
}

function main() {
  let options;
  try {
    options = readOptions(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    console.error(`${error.message}\n\n${USAGE}`);
    process.exitCode = 2;
    return;
  }
  if (options.help) {
    console.log(USAGE);
    return;
  }

  const mounts = projectMounts();
  if (!options.proxy) mounts.push({ prefix: '/', dir: path.join(repoRoot, 'docs') });

  const server = createReplica({ mounts, proxy: options.proxy });
  const failToStart = (error) => {
    console.error(
      error.code === 'EADDRINUSE'
        ? `Port ${options.port} is already in use. Stop the process that holds it, or choose another with --port <number>.`
        : `Could not start the server: ${error.message}`,
    );
    process.exitCode = 1;
  };
  server.once('error', failToStart);
  server.listen(options.port, HOST, () => {
    server.off('error', failToStart);
    console.log(startupLine(server.address().port, mounts, options.proxy));
  });
}

main();
