// Data for the GitHub board: one row per public repository, fetched in the visitor's browser
// and, when GitHub will not answer, taken from the snapshot baked into the page at build time.
//
// The file has no imports and touches no DOM, so the same code runs on the page and under
// Node in the tests. GitHub's unauthenticated API allows 60 requests an hour per IP and each
// repository costs two, so a refusal is an expected case: it is handled per repository, and
// the rows are cached for an hour.
//
// scripts/snapshot-github.mjs is plain JavaScript and keeps its own copy of the two readers
// below instead of importing this file; tests/snapshot.test.ts feeds both the same answers to
// check that they agree.

export type RepoStatus = {
  repo: string;
  stars: number;
  pushedAt: string;
  // GitHub's open_issues_count, which counts open pull requests too. Shown as GitHub states it.
  openIssues: number;
  licence: string | null;
  ci: 'passing' | 'failing' | 'unknown';
  source: 'live' | 'snapshot';
  fetchedAt: string;
};

// The shape of src/data/github-snapshot.json.
export type GithubSnapshot = { fetchedAt: string; rows: RepoStatus[] };

const API = 'https://api.github.com/repos/safdar-hussain1';
const WORKFLOW_RUNS = 'actions/workflows/tests.yml/runs?per_page=1&branch=main';

export const cacheKey = 'portfolio.github';
export const CACHE_MS = 60 * 60 * 1000;

const CI_STATES: readonly unknown[] = ['passing', 'failing', 'unknown'];
const SOURCES: readonly unknown[] = ['live', 'snapshot'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// A count from GitHub is a whole number of zero or more; anything else is not a figure to show.
function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isRepoStatus(value: unknown): value is RepoStatus {
  return (
    isRecord(value) &&
    typeof value.repo === 'string' &&
    isCount(value.stars) &&
    typeof value.pushedAt === 'string' &&
    isCount(value.openIssues) &&
    (value.licence === null || typeof value.licence === 'string') &&
    CI_STATES.includes(value.ci) &&
    SOURCES.includes(value.source) &&
    typeof value.fetchedAt === 'string'
  );
}

// Reads GET /repos/<owner>/<repo>. The figures pass through as GitHub states them. An answer
// that lacks one throws, because a default would be a figure nobody measured; loadBoard treats
// the throw as a refusal and shows the snapshot row instead.
export function parseRepo(json: unknown): Omit<RepoStatus, 'ci' | 'source' | 'fetchedAt'> {
  if (isRecord(json)) {
    const { name, stargazers_count, pushed_at, open_issues_count, license } = json;
    if (
      typeof name === 'string' &&
      isCount(stargazers_count) &&
      typeof pushed_at === 'string' &&
      isCount(open_issues_count)
    ) {
      const spdx = isRecord(license) ? license.spdx_id : null;
      return {
        repo: name,
        stars: stargazers_count,
        pushedAt: pushed_at,
        openIssues: open_issues_count,
        licence: typeof spdx === 'string' ? spdx : null,
      };
    }
  }
  throw new TypeError(
    'Expected a repository with name, stargazers_count, pushed_at and open_issues_count',
  );
}

// Reads the workflow runs list, newest run first. Only the latest run counts, and only a
// finished one says anything: a run still going (conclusion null) or one that was skipped
// leaves the state unknown, as does a repository with no runs.
export function parseRuns(json: unknown): RepoStatus['ci'] {
  const runs = isRecord(json) ? json.workflow_runs : undefined;
  const latest: unknown = Array.isArray(runs) ? runs[0] : undefined;
  const conclusion = isRecord(latest) ? latest.conclusion : undefined;
  if (conclusion === 'success') return 'passing';
  if (conclusion === 'failure' || conclusion === 'cancelled' || conclusion === 'timed_out') {
    return 'failing';
  }
  return 'unknown';
}

// Both answers for one repository, or a throw if either is refused or unreadable.
async function fetchRow(
  repo: string,
  fetchImpl: typeof fetch,
  now: () => Date,
): Promise<RepoStatus> {
  const init: RequestInit = { headers: { Accept: 'application/vnd.github+json' } };
  const base = `${API}/${encodeURIComponent(repo)}`;
  const [repoAnswer, runsAnswer] = await Promise.all([
    fetchImpl(base, init),
    fetchImpl(`${base}/${WORKFLOW_RUNS}`, init),
  ]);
  if (!repoAnswer.ok || !runsAnswer.ok) {
    throw new Error(`GitHub answered ${repoAnswer.status} and ${runsAnswer.status} for ${repo}`);
  }
  const [repoJson, runsJson] = await Promise.all([repoAnswer.json(), runsAnswer.json()]);
  return {
    ...parseRepo(repoJson),
    // The row is keyed on the name that was asked for, so it still lines up with the snapshot
    // row and the page's own list if GitHub redirects a renamed repository.
    repo,
    ci: parseRuns(runsJson),
    source: 'live',
    fetchedAt: now().toISOString(),
  };
}

// One row per repository, in the order given, all fetched at once. A repository that GitHub
// refuses, that the network cannot reach, or whose answer is unreadable gets its snapshot row
// (labelled 'snapshot', with the snapshot's own date) while the others stay live. One with
// neither is left out: there is no honest figure to show for it.
export async function loadBoard(
  repos: string[],
  fetchImpl: typeof fetch,
  snapshot: RepoStatus[],
  now: () => Date,
): Promise<RepoStatus[]> {
  const rows = await Promise.all(
    repos.map(async (repo): Promise<RepoStatus | null> => {
      try {
        return await fetchRow(repo, fetchImpl, now);
      } catch {
        const saved = snapshot.find((row) => row.repo === repo);
        return saved ? { ...saved, source: 'snapshot' } : null;
      }
    }),
  );
  return rows.filter((row): row is RepoStatus => row !== null);
}

// Rows are kept for an hour in sessionStorage so that revisiting the page in the same tab does
// not spend more of the 60 requests an hour. sessionStorage can be missing, full, blocked or
// throw on access (private windows, blocked site data), so every access sits in a try/catch
// and the page works the same without it.

// window.sessionStorage can itself throw when read, so fetching it belongs in a try/catch too.
export function getSessionStorage(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

// Rows written less than an hour ago and still the right shape, otherwise null. An entry dated
// in the future (the clock was set back) is not trusted, and an empty list is no board at all.
export function readCache(
  storage: Pick<Storage, 'getItem'> | null | undefined,
  now: () => Date,
): RepoStatus[] | null {
  try {
    const text = storage?.getItem(cacheKey);
    if (!text) return null;
    const entry: unknown = JSON.parse(text);
    if (!isRecord(entry) || typeof entry.savedAt !== 'string' || !Array.isArray(entry.rows)) {
      return null;
    }
    const age = now().getTime() - Date.parse(entry.savedAt);
    if (!(age >= 0 && age < CACHE_MS)) return null;
    return entry.rows.length > 0 && entry.rows.every(isRepoStatus) ? entry.rows : null;
  } catch {
    return null;
  }
}

// Stores the rows with the time they were saved. Returns whether they were stored; a full or
// blocked storage is not an error for the page, only a missed chance to save requests.
export function writeCache(
  storage: Pick<Storage, 'setItem'> | null | undefined,
  rows: RepoStatus[],
  now: () => Date,
): boolean {
  try {
    if (!storage || rows.length === 0) return false;
    storage.setItem(cacheKey, JSON.stringify({ savedAt: now().toISOString(), rows }));
    return true;
  } catch {
    return false;
  }
}
