import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBoard, parseRepo, parseRuns, type RepoStatus } from '../src/lib/github';
import {
  REPOS,
  apiPaths,
  buildSnapshot,
  ghApi,
  serialise,
  snapshotRow,
} from '../scripts/snapshot-github.mjs';

// The script shells out to gh. Replacing child_process keeps every test off the network and
// lets them see whether anything tried to run gh.
const { exec } = vi.hoisted(() => ({ exec: vi.fn() }));
vi.mock('node:child_process', () => ({ execFileSync: exec }));
const callsWhileImporting = exec.mock.calls.length;

type Snapshot = { fetchedAt: string; rows: RepoStatus[] };

const raw = readFileSync(new URL('../src/data/github-snapshot.json', import.meta.url), 'utf8');
const snapshot = JSON.parse(raw) as Snapshot;

const DAY = 24 * 60 * 60 * 1000;
const liveRepos = [
  'wardos',
  'nightingale',
  'trafficlens',
  'red-light-green-light-cv',
  'carmine',
  'homecast',
];

// GitHub's answers, trimmed to what the board reads plus some noise.
function repoAnswer(name: string, over: Record<string, unknown> = {}) {
  return {
    id: 1,
    name,
    private: false,
    stargazers_count: 7,
    pushed_at: '2026-10-18T09:30:00Z',
    open_issues_count: 2,
    license: { key: 'mit', name: 'MIT License', spdx_id: 'MIT' },
    ...over,
  };
}

function runsAnswer(conclusion: string | null, status = 'completed') {
  return { total_count: 1, workflow_runs: [{ id: 9, status, conclusion, head_branch: 'main' }] };
}

it('snapshot names every live repo and is dated', () => {
  const named = snapshot.rows.map((row) => row.repo);
  for (const repo of liveRepos) expect(named).toContain(repo);

  const age = Date.now() - Date.parse(snapshot.fetchedAt);
  expect(Number.isNaN(age)).toBe(false);
  expect(age).toBeLessThanOrEqual(30 * DAY);
  // A snapshot cannot be taken in the future; the slack covers a clock a few minutes fast.
  expect(age).toBeGreaterThanOrEqual(-10 * 60 * 1000);
});

describe('the committed snapshot', () => {
  it('is an object with a date and a list of rows, and nothing else', () => {
    expect(Object.keys(snapshot).sort()).toEqual(['fetchedAt', 'rows']);
    expect(Array.isArray(snapshot.rows)).toBe(true);
  });

  it('lists the repositories the script bakes, in the same order, once each', () => {
    const named = snapshot.rows.map((row) => row.repo);
    expect(named).toEqual(REPOS);
    expect(new Set(named).size).toBe(named.length);
  });

  it('gives every row each RepoStatus field with the right type', () => {
    for (const row of snapshot.rows) {
      const label = row.repo;
      expect(typeof row.repo, label).toBe('string');
      expect(row.repo.length, label).toBeGreaterThan(0);
      expect(Number.isInteger(row.stars) && row.stars >= 0, `${label} stars`).toBe(true);
      expect(Number.isNaN(Date.parse(row.pushedAt)), `${label} pushedAt`).toBe(false);
      expect(Number.isInteger(row.openIssues) && row.openIssues >= 0, `${label} openIssues`).toBe(true);
      expect(row.licence === null || typeof row.licence === 'string', `${label} licence`).toBe(true);
      expect(Number.isNaN(Date.parse(row.fetchedAt)), `${label} fetchedAt`).toBe(false);
    }
  });

  it('gives every row a ci of passing, failing or unknown', () => {
    for (const row of snapshot.rows) {
      expect(['passing', 'failing', 'unknown'], row.repo).toContain(row.ci);
    }
  });

  it('labels every row a snapshot and dates it with the snapshot date', () => {
    for (const row of snapshot.rows) {
      expect(row.source, row.repo).toBe('snapshot');
      expect(row.fetchedAt, row.repo).toBe(snapshot.fetchedAt);
    }
  });

  it('has exactly the fields the browser library produces', () => {
    const fromLibrary: RepoStatus = {
      ...parseRepo(repoAnswer('wardos')),
      ci: parseRuns(runsAnswer('success')),
      source: 'snapshot',
      fetchedAt: snapshot.fetchedAt,
    };
    for (const row of snapshot.rows) {
      expect(Object.keys(row).sort(), row.repo).toEqual(Object.keys(fromLibrary).sort());
    }
  });

  it('is two-space JSON with a trailing newline, the way the script writes it', () => {
    expect(raw).toBe(serialise(snapshot));
    expect(raw.endsWith('}\n')).toBe(true);
    expect(raw).toContain('\n  "rows": [\n');
  });
});

describe('the snapshot script and the browser library', () => {
  const stamp = '2026-10-19T12:00:00.000Z';
  const pairs = [
    { name: 'wardos', repo: repoAnswer('wardos'), runs: runsAnswer('success') },
    {
      name: 'carmine',
      repo: repoAnswer('carmine', { license: null, stargazers_count: 1204 }),
      runs: runsAnswer('failure'),
    },
    {
      name: 'homecast',
      repo: repoAnswer('homecast', { license: { key: 'other', name: 'Other', spdx_id: null } }),
      runs: { total_count: 0, workflow_runs: [] },
    },
    { name: 'trafficlens', repo: repoAnswer('trafficlens'), runs: runsAnswer('cancelled') },
    { name: 'nightingale', repo: repoAnswer('nightingale'), runs: runsAnswer('timed_out') },
    {
      name: 'red-light-green-light-cv',
      repo: repoAnswer('red-light-green-light-cv', { open_issues_count: 0 }),
      runs: runsAnswer(null, 'in_progress'),
    },
  ];

  it.each(pairs)('read the same row from the same answers for $name', ({ name, repo, runs }) => {
    const fromScript = snapshotRow(name, repo, runs, stamp);
    const fromLibrary: RepoStatus = {
      ...parseRepo(repo),
      ci: parseRuns(runs),
      source: 'snapshot',
      fetchedAt: stamp,
    };

    expect(fromScript).toEqual(fromLibrary);
  });

  it('both reject an answer that is not a repository', () => {
    const notARepo = { message: 'Not Found', status: '404' };

    expect(() => parseRepo(notARepo)).toThrow();
    expect(() => snapshotRow('wardos', notARepo, runsAnswer('success'), stamp)).toThrow();
  });

  it('both reject a repository answer with a malformed figure', () => {
    const malformed = repoAnswer('wardos', { stargazers_count: '12' });

    expect(() => parseRepo(malformed)).toThrow();
    expect(() => snapshotRow('wardos', malformed, runsAnswer('success'), stamp)).toThrow();
  });

  it('ask GitHub for the same two endpoints', async () => {
    const seen: string[] = [];
    const impl: typeof fetch = async (input) => {
      seen.push(String(input));
      return new Response('{}', { status: 500 });
    };

    await loadBoard(['red-light-green-light-cv'], impl, [], () => new Date());

    const paths = apiPaths('red-light-green-light-cv');
    expect(seen.sort()).toEqual(
      [`https://api.github.com/${paths.repo}`, `https://api.github.com/${paths.runs}`].sort(),
    );
  });
});

describe('buildSnapshot', () => {
  const clock = () => new Date('2026-10-19T12:00:00.000Z');

  function answers(path: string) {
    const name = path.split('/')[2] ?? '';
    return path.includes('/actions/') ? runsAnswer('success') : repoAnswer(name);
  }

  it('builds one snapshot row per repository from its two endpoints, all dated alike', () => {
    const asked: string[] = [];
    const api = (path: string) => {
      asked.push(path);
      return answers(path);
    };

    const built = buildSnapshot(['wardos', 'carmine'], api, clock);

    expect(built.fetchedAt).toBe('2026-10-19T12:00:00.000Z');
    expect(built.rows.map((row: RepoStatus) => row.repo)).toEqual(['wardos', 'carmine']);
    expect(
      built.rows.every(
        (row: RepoStatus) => row.source === 'snapshot' && row.fetchedAt === built.fetchedAt,
      ),
    ).toBe(true);
    expect(asked).toEqual([
      'repos/safdar-hussain1/wardos',
      'repos/safdar-hussain1/wardos/actions/workflows/tests.yml/runs?per_page=1&branch=main',
      'repos/safdar-hussain1/carmine',
      'repos/safdar-hussain1/carmine/actions/workflows/tests.yml/runs?per_page=1&branch=main',
    ]);
  });

  it('throws rather than return a partial snapshot when one request fails', () => {
    const api = (path: string) => {
      if (path.includes('/carmine')) throw new Error('HTTP 404: Not Found');
      return answers(path);
    };

    expect(() => buildSnapshot(['wardos', 'carmine'], api, clock)).toThrow(/carmine/);
  });

  it('throws when GitHub calls a repository something other than the list does', () => {
    const api = (path: string) =>
      path.includes('/actions/') ? runsAnswer('success') : repoAnswer('wardos-renamed');

    expect(() => buildSnapshot(['wardos'], api, clock)).toThrow(/wardos-renamed/);
  });

  it('serialises as two-space JSON ending in a newline', () => {
    expect(serialise({ fetchedAt: 'x', rows: [] })).toBe('{\n  "fetchedAt": "x",\n  "rows": []\n}\n');
  });
});

describe('the script as a module', () => {
  it('does not call gh or write the snapshot just by being imported', () => {
    expect(callsWhileImporting).toBe(0);
  });
});

describe('ghApi', () => {
  beforeEach(() => exec.mockReset());

  it('runs gh api with the path as a single argument and parses the JSON it prints', () => {
    const path = 'repos/safdar-hussain1/wardos/actions/workflows/tests.yml/runs?per_page=1&branch=main';
    exec.mockReturnValueOnce('{"total_count":0,"workflow_runs":[]}');

    expect(ghApi(path)).toEqual({ total_count: 0, workflow_runs: [] });

    expect(exec).toHaveBeenCalledTimes(1);
    expect(exec).toHaveBeenCalledWith('gh', ['api', path], expect.objectContaining({ encoding: 'utf8' }));
  });

  it('reports the path and what gh said when gh fails', () => {
    exec.mockImplementationOnce(() => {
      throw Object.assign(new Error('Command failed: gh api'), {
        stderr: 'gh: Not Found (HTTP 404)\n',
      });
    });

    expect(() => ghApi('repos/safdar-hussain1/nope')).toThrow(
      /repos\/safdar-hussain1\/nope failed: gh: Not Found \(HTTP 404\)/,
    );
  });

  it('names the path when gh prints something that is not JSON', () => {
    exec.mockReturnValueOnce('Not JSON at all');

    expect(() => ghApi('repos/safdar-hussain1/wardos')).toThrow(
      /repos\/safdar-hussain1\/wardos did not print JSON/,
    );
  });

  it('says so when the gh CLI is not installed', () => {
    exec.mockImplementationOnce(() => {
      throw Object.assign(new Error('spawnSync gh ENOENT'), { code: 'ENOENT' });
    });

    expect(() => ghApi('repos/safdar-hussain1/wardos')).toThrow(/gh CLI is not installed/);
  });
});
