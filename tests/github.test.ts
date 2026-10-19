import { describe, expect, it } from 'vitest';
import {
  CACHE_MS,
  cacheKey,
  getSessionStorage,
  loadBoard,
  parseRepo,
  parseRuns,
  readCache,
  writeCache,
  type RepoStatus,
} from '../src/lib/github';

const NOW = new Date('2026-10-19T12:00:00.000Z');
const now = () => NOW;
const API = 'https://api.github.com/repos/safdar-hussain1';
const RUNS = 'actions/workflows/tests.yml/runs?per_page=1&branch=main';

// The parts of GitHub's answer for GET /repos/<owner>/<repo> that the board reads, plus noise.
function repoAnswer(name: string, over: Record<string, unknown> = {}) {
  return {
    id: 1,
    name,
    full_name: `safdar-hussain1/${name}`,
    private: false,
    stargazers_count: 7,
    watchers_count: 7,
    pushed_at: '2026-10-18T09:30:00Z',
    open_issues_count: 2,
    license: { key: 'mit', name: 'MIT License', spdx_id: 'MIT' },
    ...over,
  };
}

// GitHub's answer for the workflow runs list, newest run first.
function runsAnswer(conclusion: string | null, status = 'completed') {
  return { total_count: 1, workflow_runs: [{ id: 9, status, conclusion, head_branch: 'main' }] };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function savedRow(repo: string, over: Partial<RepoStatus> = {}): RepoStatus {
  return {
    repo,
    stars: 1,
    pushedAt: '2026-10-06T19:25:39Z',
    openIssues: 0,
    licence: 'MIT',
    ci: 'passing',
    source: 'snapshot',
    fetchedAt: '2026-10-10T08:00:00.000Z',
    ...over,
  };
}

type Route = (url: string) => Response | Promise<Response>;

// A fetch that records every call the moment it is made and answers from `route`.
function fakeFetch(route: Route) {
  const calls: { url: string; accept: string | undefined }[] = [];
  const impl: typeof fetch = async (input, init) => {
    const headers = init?.headers as Record<string, string> | undefined;
    calls.push({ url: String(input), accept: headers?.Accept });
    return route(String(input));
  };
  return { impl, calls };
}

// Every request answered successfully; `stars` overrides the star count per repository name.
function healthy(stars: Record<string, number> = {}, conclusion: string | null = 'success'): Route {
  return (url) => {
    if (url.includes('/actions/')) return jsonResponse(runsAnswer(conclusion));
    const name = url.slice(url.lastIndexOf('/') + 1);
    return jsonResponse(repoAnswer(name, { stargazers_count: stars[name] ?? 7 }));
  };
}

it('parseRepo reads stars, pushed_at, open issues and licence', () => {
  const answer = repoAnswer('wardos', {
    stargazers_count: 1234,
    pushed_at: '2026-10-19T13:08:13Z',
    open_issues_count: 3,
  });
  expect(parseRepo(answer)).toEqual({
    repo: 'wardos',
    stars: 1234,
    pushedAt: '2026-10-19T13:08:13Z',
    openIssues: 3,
    licence: 'MIT',
  });
});

it('parseRuns maps success to passing, failure to failing, empty to unknown', () => {
  expect(parseRuns(runsAnswer('success'))).toBe('passing');
  expect(parseRuns(runsAnswer('failure'))).toBe('failing');
  expect(parseRuns({ total_count: 0, workflow_runs: [] })).toBe('unknown');
});

it('falls back to the snapshot when the API refuses', async () => {
  const { impl } = fakeFetch(() =>
    jsonResponse({ message: 'API rate limit exceeded for 203.0.113.9.' }, 403),
  );
  const snapshot = [savedRow('wardos', { stars: 5 }), savedRow('carmine', { ci: 'failing' })];

  const rows = await loadBoard(['wardos', 'carmine'], impl, snapshot, now);

  expect(rows).toEqual(snapshot);
  expect(rows.map((row) => row.source)).toEqual(['snapshot', 'snapshot']);
  expect(rows.map((row) => row.fetchedAt)).toEqual([
    '2026-10-10T08:00:00.000Z',
    '2026-10-10T08:00:00.000Z',
  ]);
});

it('uses live rows when the API answers', async () => {
  const { impl } = fakeFetch((url) => {
    if (url.includes('/actions/')) return jsonResponse(runsAnswer('success'));
    return url.endsWith('/wardos')
      ? jsonResponse(repoAnswer('wardos', { stargazers_count: 12, open_issues_count: 0 }))
      : jsonResponse(repoAnswer('carmine', { stargazers_count: 3, license: null }));
  });
  const snapshot = [savedRow('wardos'), savedRow('carmine')];

  const rows = await loadBoard(['wardos', 'carmine'], impl, snapshot, now);

  expect(rows).toEqual([
    {
      repo: 'wardos',
      stars: 12,
      pushedAt: '2026-10-18T09:30:00Z',
      openIssues: 0,
      licence: 'MIT',
      ci: 'passing',
      source: 'live',
      fetchedAt: '2026-10-19T12:00:00.000Z',
    },
    {
      repo: 'carmine',
      stars: 3,
      pushedAt: '2026-10-18T09:30:00Z',
      openIssues: 2,
      licence: null,
      ci: 'passing',
      source: 'live',
      fetchedAt: '2026-10-19T12:00:00.000Z',
    },
  ]);
});

describe('parseRepo', () => {
  it('gives a null licence when the repository has none', () => {
    expect(parseRepo(repoAnswer('wardos', { license: null })).licence).toBeNull();
  });

  it('gives a null licence when the licence has no SPDX id', () => {
    const other = { key: 'other', name: 'Other', spdx_id: null };
    expect(parseRepo(repoAnswer('wardos', { license: other })).licence).toBeNull();
    expect(parseRepo(repoAnswer('wardos', { license: undefined })).licence).toBeNull();
  });

  it('keeps the SPDX id exactly as GitHub states it', () => {
    const apache = { key: 'apache-2.0', name: 'Apache License 2.0', spdx_id: 'Apache-2.0' };
    expect(parseRepo(repoAnswer('wardos', { license: apache })).licence).toBe('Apache-2.0');
  });

  it('throws on an answer that is not a repository', () => {
    expect(() => parseRepo({ message: 'Not Found', status: '404' })).toThrow();
    expect(() => parseRepo(null)).toThrow();
    expect(() => parseRepo('Not Found')).toThrow();
    expect(() => parseRepo([])).toThrow();
  });

  it('throws instead of inventing a figure that is missing or malformed', () => {
    expect(() => parseRepo(repoAnswer('wardos', { stargazers_count: '12' }))).toThrow();
    expect(() => parseRepo(repoAnswer('wardos', { stargazers_count: undefined }))).toThrow();
    expect(() => parseRepo(repoAnswer('wardos', { open_issues_count: null }))).toThrow();
    expect(() => parseRepo(repoAnswer('wardos', { open_issues_count: -1 }))).toThrow();
    expect(() => parseRepo(repoAnswer('wardos', { pushed_at: null }))).toThrow();
    expect(() => parseRepo(repoAnswer('wardos', { name: undefined }))).toThrow();
  });
});

describe('parseRuns', () => {
  it.each(['cancelled', 'timed_out'])('maps %s to failing', (conclusion) => {
    expect(parseRuns(runsAnswer(conclusion))).toBe('failing');
  });

  it.each(['skipped', 'neutral', 'action_required', 'stale'])(
    'leaves a %s run unknown',
    (conclusion) => {
      expect(parseRuns(runsAnswer(conclusion))).toBe('unknown');
    },
  );

  it('leaves a run that has not finished unknown', () => {
    expect(parseRuns(runsAnswer(null, 'in_progress'))).toBe('unknown');
    expect(parseRuns(runsAnswer(null, 'queued'))).toBe('unknown');
  });

  it('reads only the latest run, which GitHub lists first', () => {
    const answer = {
      total_count: 2,
      workflow_runs: [{ conclusion: 'failure' }, { conclusion: 'success' }],
    };
    expect(parseRuns(answer)).toBe('failing');
  });

  it('answers unknown for anything that is not a list of runs', () => {
    expect(parseRuns(null)).toBe('unknown');
    expect(parseRuns(undefined)).toBe('unknown');
    expect(parseRuns('success')).toBe('unknown');
    expect(parseRuns({})).toBe('unknown');
    expect(parseRuns({ message: 'Not Found' })).toBe('unknown');
    expect(parseRuns({ workflow_runs: 'success' })).toBe('unknown');
    expect(parseRuns({ workflow_runs: [null] })).toBe('unknown');
    expect(parseRuns({ workflow_runs: [{}] })).toBe('unknown');
  });
});

describe('loadBoard', () => {
  it('asks for each repository and its latest tests run on main, in the JSON media type', async () => {
    const { impl, calls } = fakeFetch(healthy());

    await loadBoard(['wardos', 'red-light-green-light-cv'], impl, [], now);

    expect(calls.map((call) => call.url).sort()).toEqual(
      [
        `${API}/wardos`,
        `${API}/wardos/${RUNS}`,
        `${API}/red-light-green-light-cv`,
        `${API}/red-light-green-light-cv/${RUNS}`,
      ].sort(),
    );
    expect(calls.every((call) => call.accept === 'application/vnd.github+json')).toBe(true);
  });

  it('sends every request before any answer arrives', async () => {
    let open!: () => void;
    const gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    const { impl, calls } = fakeFetch(async (url) => {
      await gate;
      return healthy()(url);
    });

    const pending = loadBoard(['wardos', 'nightingale', 'carmine'], impl, [], now);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toHaveLength(6);

    open();
    expect(await pending).toHaveLength(3);
  });

  it('replaces the snapshot figures instead of mixing them into the live row', async () => {
    const { impl } = fakeFetch(healthy({ wardos: 9 }, 'failure'));
    const snapshot = [savedRow('wardos', { stars: 1, ci: 'passing', licence: 'Apache-2.0' })];

    const [row] = await loadBoard(['wardos'], impl, snapshot, now);

    expect(row).toMatchObject({ stars: 9, ci: 'failing', licence: 'MIT', source: 'live' });
  });

  it('keeps the requested name and order', async () => {
    const { impl } = fakeFetch(healthy());
    const names = ['homecast', 'wardos', 'carmine', 'nightingale'];

    const rows = await loadBoard(names, impl, [], now);

    expect(rows.map((row) => row.repo)).toEqual(names);
  });

  it('keys the live row on the requested name even if GitHub reports another', async () => {
    const { impl } = fakeFetch((url) =>
      url.includes('/actions/')
        ? jsonResponse(runsAnswer('success'))
        : jsonResponse(repoAnswer('wardos-renamed')),
    );

    const [row] = await loadBoard(['wardos'], impl, [], now);

    expect(row?.repo).toBe('wardos');
  });

  it('falls back to the snapshot when the network is unreachable', async () => {
    const impl: typeof fetch = async () => {
      throw new TypeError('Failed to fetch');
    };
    const snapshot = [savedRow('wardos', { stars: 4 })];

    const rows = await loadBoard(['wardos'], impl, snapshot, now);

    expect(rows).toEqual(snapshot);
  });

  it('falls back for the one repository that is refused and keeps the others live', async () => {
    const { impl } = fakeFetch((url) =>
      url.includes('/nightingale') ? jsonResponse({ message: 'Server Error' }, 500) : healthy()(url),
    );
    const snapshot = [savedRow('wardos'), savedRow('nightingale', { stars: 2 }), savedRow('carmine')];

    const rows = await loadBoard(['wardos', 'nightingale', 'carmine'], impl, snapshot, now);

    expect(rows.map((row) => [row.repo, row.source])).toEqual([
      ['wardos', 'live'],
      ['nightingale', 'snapshot'],
      ['carmine', 'live'],
    ]);
    expect(rows[1]).toEqual(snapshot[1]);
  });

  it('uses the whole snapshot row when only the workflow request is refused', async () => {
    const { impl } = fakeFetch((url) =>
      url.includes('/actions/')
        ? jsonResponse({ message: 'Not Found' }, 404)
        : jsonResponse(repoAnswer('wardos', { stargazers_count: 99 })),
    );
    const snapshot = [savedRow('wardos', { stars: 5 })];

    const rows = await loadBoard(['wardos'], impl, snapshot, now);

    expect(rows).toEqual(snapshot);
  });

  it('treats any non-ok status as a refusal, whatever the body says', async () => {
    const snapshot = [savedRow('wardos', { stars: 5 })];
    const refused = (url: string) =>
      url.includes('/actions/')
        ? jsonResponse(runsAnswer('success'))
        : jsonResponse(repoAnswer('wardos', { stargazers_count: 99 }), 500);
    const refusedRuns = (url: string) =>
      url.includes('/actions/')
        ? jsonResponse(runsAnswer('success'), 429)
        : jsonResponse(repoAnswer('wardos', { stargazers_count: 99 }));

    for (const route of [refused, refusedRuns]) {
      const { impl } = fakeFetch(route);
      expect(await loadBoard(['wardos'], impl, snapshot, now)).toEqual(snapshot);
    }
  });

  it('falls back to the snapshot when an answer is not JSON', async () => {
    const { impl } = fakeFetch(() => new Response('<html>Service Unavailable</html>', { status: 200 }));
    const snapshot = [savedRow('wardos')];

    expect(await loadBoard(['wardos'], impl, snapshot, now)).toEqual(snapshot);
  });

  it('falls back to the snapshot when the answer is not a repository', async () => {
    const { impl } = fakeFetch(() => jsonResponse({ message: 'Moved Permanently' }));
    const snapshot = [savedRow('wardos')];

    expect(await loadBoard(['wardos'], impl, snapshot, now)).toEqual(snapshot);
  });

  it('always labels a fallback row as a snapshot, whatever the saved row says', async () => {
    const { impl } = fakeFetch(() => jsonResponse({}, 403));
    const saved = savedRow('wardos', { source: 'live', fetchedAt: '2026-10-11T07:00:00.000Z' });

    const [row] = await loadBoard(['wardos'], impl, [saved], now);

    expect(row).toEqual({ ...saved, source: 'snapshot' });
  });

  it('leaves out a repository that has neither a live answer nor a snapshot row', async () => {
    const { impl } = fakeFetch((url) =>
      url.includes('/carmine') ? jsonResponse({}, 403) : healthy()(url),
    );

    const rows = await loadBoard(['wardos', 'carmine', 'homecast'], impl, [], now);

    expect(rows.map((row) => row.repo)).toEqual(['wardos', 'homecast']);
  });

  it('makes no request when there is nothing to load', async () => {
    const { impl, calls } = fakeFetch(healthy());

    expect(await loadBoard([], impl, [savedRow('wardos')], now)).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});

// A minimal sessionStorage stand-in.
function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

const rowsToKeep = [savedRow('wardos', { source: 'live' }), savedRow('carmine', { ci: 'unknown' })];
const clockAt = (iso: string) => () => new Date(iso);

describe('the hour-long cache', () => {
  it('lives under portfolio.github for an hour', () => {
    expect(cacheKey).toBe('portfolio.github');
    expect(CACHE_MS).toBe(60 * 60 * 1000);
  });

  it('hands back rows written less than an hour ago, unchanged', () => {
    const storage = memoryStorage();

    expect(writeCache(storage, rowsToKeep, clockAt('2026-10-19T12:00:00.000Z'))).toBe(true);

    expect(storage.data.has(cacheKey)).toBe(true);
    expect(readCache(storage, clockAt('2026-10-19T12:00:00.000Z'))).toEqual(rowsToKeep);
    expect(readCache(storage, clockAt('2026-10-19T12:59:59.999Z'))).toEqual(rowsToKeep);
  });

  it('returns null once an hour has passed', () => {
    const storage = memoryStorage();
    writeCache(storage, rowsToKeep, clockAt('2026-10-19T12:00:00.000Z'));

    expect(readCache(storage, clockAt('2026-10-19T13:00:00.000Z'))).toBeNull();
    expect(readCache(storage, clockAt('2026-10-20T12:00:00.000Z'))).toBeNull();
  });

  it('returns null for an entry dated in the future, such as after the clock was set back', () => {
    const storage = memoryStorage();
    writeCache(storage, rowsToKeep, clockAt('2026-10-19T12:00:00.000Z'));

    expect(readCache(storage, clockAt('2026-10-19T11:59:59.999Z'))).toBeNull();
  });

  it('returns null when nothing is stored', () => {
    expect(readCache(memoryStorage(), now)).toBeNull();
  });

  it('returns null for stored text that is not JSON', () => {
    const storage = memoryStorage();
    storage.setItem(cacheKey, '{"savedAt":');

    expect(readCache(storage, now)).toBeNull();
  });

  it('returns null for an entry of the wrong shape', () => {
    const storage = memoryStorage();
    const at = '2026-10-19T11:30:00.000Z';
    const wrongShapes = [
      'null',
      '[]',
      JSON.stringify({ rows: rowsToKeep }),
      JSON.stringify({ savedAt: at }),
      JSON.stringify({ savedAt: 'yesterday', rows: rowsToKeep }),
      JSON.stringify({ savedAt: at, rows: [{ repo: 'wardos' }] }),
      JSON.stringify({ savedAt: at, rows: [{ ...rowsToKeep[0], ci: 'green' }] }),
      JSON.stringify({ savedAt: at, rows: [{ ...rowsToKeep[0], stars: '1' }] }),
      JSON.stringify({ savedAt: at, rows: [{ ...rowsToKeep[0], source: 'cache' }] }),
    ];

    for (const text of wrongShapes) {
      storage.setItem(cacheKey, text);
      expect(readCache(storage, now), text).toBeNull();
    }
  });

  it('does not store or return an empty board', () => {
    const storage = memoryStorage();

    expect(writeCache(storage, [], now)).toBe(false);
    expect(storage.data.size).toBe(0);

    storage.setItem(cacheKey, JSON.stringify({ savedAt: '2026-10-19T11:30:00.000Z', rows: [] }));
    expect(readCache(storage, now)).toBeNull();
  });

  it('returns null instead of throwing when reading fails', () => {
    const storage = {
      getItem: () => {
        throw new Error('The operation is insecure.');
      },
    };

    expect(readCache(storage, now)).toBeNull();
  });

  it('returns false instead of throwing when writing fails', () => {
    const storage = {
      setItem: () => {
        throw new Error('The quota has been exceeded.');
      },
    };

    expect(writeCache(storage, rowsToKeep, now)).toBe(false);
  });

  it('returns false when the rows cannot be written as JSON', () => {
    const storage = memoryStorage();
    const circular = { ...rowsToKeep[0] } as Record<string, unknown>;
    circular.self = circular;

    expect(writeCache(storage, [circular as unknown as RepoStatus], now)).toBe(false);
  });

  it('does nothing without a storage object', () => {
    expect(readCache(null, now)).toBeNull();
    expect(readCache(undefined, now)).toBeNull();
    expect(writeCache(null, rowsToKeep, now)).toBe(false);
    expect(writeCache(undefined, rowsToKeep, now)).toBe(false);
  });
});

describe('getSessionStorage', () => {
  const scope = globalThis as Record<string, unknown>;

  // Runs `check` with globalThis.sessionStorage replaced (or removed), then puts it back.
  function withSessionStorage(replacement: PropertyDescriptor | null, check: () => void) {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
    if (replacement) {
      Object.defineProperty(globalThis, 'sessionStorage', { ...replacement, configurable: true });
    } else {
      delete scope.sessionStorage;
    }
    try {
      check();
    } finally {
      if (original) Object.defineProperty(globalThis, 'sessionStorage', original);
      else delete scope.sessionStorage;
    }
  }

  it('returns null outside a browser, where there is no sessionStorage', () => {
    withSessionStorage(null, () => expect(getSessionStorage()).toBeNull());
  });

  it('returns null when the browser denies access to sessionStorage', () => {
    const denied = {
      get() {
        throw new Error('Access is denied for this document.');
      },
    };
    withSessionStorage(denied, () => expect(getSessionStorage()).toBeNull());
  });

  it('returns the storage object when the browser provides one', () => {
    const storage = memoryStorage();
    withSessionStorage({ value: storage }, () => expect(getSessionStorage()).toBe(storage));
  });
});
