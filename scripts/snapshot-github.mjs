// Bakes the GitHub board's fallback rows into src/data/github-snapshot.json.
//
// The board asks GitHub's free API from the visitor's browser (src/lib/github.ts). That API
// allows 60 requests an hour per IP, so when it refuses, or the visitor is offline, the page
// shows these rows instead, labels them a snapshot and says when they were taken. The figures
// are whatever GitHub returned when this script ran; nothing is rounded or edited.
//
// It goes through the authenticated `gh` CLI (`gh auth status`), so the run is not held to the
// browser's limit. The file is written only when every repository answered, so a failed run
// leaves the previous snapshot as it was. Run it on purpose, when the list below changes or the
// snapshot is getting old:
//
//   node scripts/snapshot-github.mjs

import { execFileSync } from 'node:child_process';
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const OWNER = 'safdar-hussain1';

// The repositories on the board, in the order the page shows them. To add one, add its name
// here and run the script again. It needs a workflow file named tests.yml: the browser treats
// a missing workflow as a refusal, so the board could never show that repository live.
export const REPOS = [
  'wardos',
  'nightingale',
  'trafficlens',
  'red-light-green-light-cv',
  'carmine',
  'homecast',
];

const SNAPSHOT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../src/data/github-snapshot.json',
);

/** @typedef {import('../src/lib/github').RepoStatus} RepoStatus */
/** @typedef {import('../src/lib/github').GithubSnapshot} GithubSnapshot */

const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const isCount = (value) => Number.isInteger(value) && value >= 0;

/**
 * The two API paths behind one row. They are the same two the browser requests, minus the host.
 * @param {string} repo
 * @returns {{ repo: string, runs: string }}
 */
export function apiPaths(repo) {
  const base = `repos/${OWNER}/${encodeURIComponent(repo)}`;
  return {
    repo: base,
    runs: `${base}/actions/workflows/tests.yml/runs?per_page=1&branch=main`,
  };
}

// The two readers below take the same fields as parseRepo and parseRuns in src/lib/github.ts.
// This script is plain JavaScript and does not import that TypeScript file, so they are
// written out again here; tests/snapshot.test.ts feeds both the same answers to keep them in
// step.

/**
 * stargazers_count, pushed_at, open_issues_count and license.spdx_id from GET /repos/<owner>/<repo>.
 * Throws on an answer that lacks a figure rather than writing a made-up one.
 * @param {unknown} json
 * @returns {{ stars: number, pushedAt: string, openIssues: number, licence: string | null }}
 */
export function readRepoFields(json) {
  if (isRecord(json)) {
    const { stargazers_count, pushed_at, open_issues_count, license } = json;
    if (isCount(stargazers_count) && typeof pushed_at === 'string' && isCount(open_issues_count)) {
      const spdx = isRecord(license) ? license.spdx_id : null;
      return {
        stars: stargazers_count,
        pushedAt: pushed_at,
        openIssues: open_issues_count,
        licence: typeof spdx === 'string' ? spdx : null,
      };
    }
  }
  throw new TypeError(
    'Expected a repository with stargazers_count, pushed_at and open_issues_count',
  );
}

/**
 * The state of the newest workflow run, which GitHub lists first. Only a finished run says
 * anything; no runs, or one still going or skipped, is unknown.
 * @param {unknown} json
 * @returns {RepoStatus['ci']}
 */
export function readCi(json) {
  const runs = isRecord(json) ? json.workflow_runs : undefined;
  const latest = Array.isArray(runs) ? runs[0] : undefined;
  const conclusion = isRecord(latest) ? latest.conclusion : undefined;
  if (conclusion === 'success') return 'passing';
  if (conclusion === 'failure' || conclusion === 'cancelled' || conclusion === 'timed_out') {
    return 'failing';
  }
  return 'unknown';
}

/**
 * One snapshot row. The repository is keyed on the name in REPOS, which is the name the browser
 * asks for and the one loadBoard looks the row up by.
 * @param {string} repo
 * @param {unknown} repoJson
 * @param {unknown} runsJson
 * @param {string} fetchedAt
 * @returns {RepoStatus}
 */
export function snapshotRow(repo, repoJson, runsJson, fetchedAt) {
  return {
    repo,
    ...readRepoFields(repoJson),
    ci: readCi(runsJson),
    source: 'snapshot',
    fetchedAt,
  };
}

/**
 * Calls the GitHub API through the gh CLI and parses the answer.
 * @param {string} path
 * @returns {unknown}
 */
export function ghApi(path) {
  let stdout;
  try {
    stdout = execFileSync('gh', ['api', path], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error('the gh CLI is not installed or not on PATH');
    const detail = String(error.stderr ?? '').trim() || error.message;
    throw new Error(`gh api ${path} failed: ${detail}`, { cause: error });
  }
  try {
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(`gh api ${path} did not print JSON`, { cause: error });
  }
}

function buildRow(repo, api, fetchedAt) {
  const paths = apiPaths(repo);
  const repoJson = api(paths.repo);
  const runsJson = api(paths.runs);
  // A different name means the repository was renamed or the list is mistyped; either way the
  // row would not match what the page links to.
  if (isRecord(repoJson) && repoJson.name !== repo) {
    throw new Error(`GitHub names ${OWNER}/${repo} "${repoJson.name}"; update REPOS`);
  }
  return snapshotRow(repo, repoJson, runsJson, fetchedAt);
}

/**
 * Fetches both endpoints for each repository, one after another, and returns the whole snapshot
 * or throws. Every row carries the same date, taken before the first request, so no row is
 * older than the date it is given.
 * @param {string[]} repos
 * @param {(path: string) => unknown} api
 * @param {() => Date} [now]
 * @returns {GithubSnapshot}
 */
export function buildSnapshot(repos, api, now = () => new Date()) {
  const fetchedAt = now().toISOString();
  const rows = repos.map((repo) => {
    try {
      return buildRow(repo, api, fetchedAt);
    } catch (error) {
      throw new Error(`${repo}: ${error.message}`, { cause: error });
    }
  });
  return { fetchedAt, rows };
}

/**
 * The file's text: two-space JSON and a final newline, so a regenerated file diffs line by line.
 * @param {GithubSnapshot} snapshot
 * @returns {string}
 */
export function serialise(snapshot) {
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}

function main() {
  const snapshot = buildSnapshot(REPOS, ghApi);
  mkdirSync(dirname(SNAPSHOT_PATH), { recursive: true });
  writeFileSync(SNAPSHOT_PATH, serialise(snapshot));
  for (const row of snapshot.rows) {
    console.log(
      [
        row.repo.padEnd(26),
        `stars ${row.stars}`.padEnd(9),
        `issues ${row.openIssues}`.padEnd(10),
        (row.licence ?? 'no licence').padEnd(11),
        row.ci.padEnd(8),
        `pushed ${row.pushedAt}`,
      ].join(' '),
    );
  }
  const where = relative(process.cwd(), SNAPSHOT_PATH);
  console.log(`Wrote ${where}: ${snapshot.rows.length} repositories, fetched ${snapshot.fetchedAt}`);
}

// Run the snapshot only when this file is the one node was started with, so the tests can
// import the functions above without calling GitHub or touching the file.
function startedDirectly() {
  try {
    return (
      Boolean(process.argv[1]) &&
      import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
    );
  } catch {
    return false;
  }
}

if (startedDirectly()) {
  try {
    main();
  } catch (error) {
    console.error(`snapshot-github: ${error.message}`);
    process.exitCode = 1;
  }
}
