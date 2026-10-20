import { getSessionStorage, loadBoard, readCache, writeCache, type RepoStatus } from '../lib/github';
import { relativeTime, shortIsoDate } from '../lib/format';

const CI_WORDS: Record<RepoStatus['ci'], string> = { passing: 'tests passing', failing: 'tests failing', unknown: 'tests not run yet' };

// Swaps the baked rows for live ones once GitHub answers. Every figure shown is GitHub's own.
export async function renderBoard(root: HTMLElement, fetchImpl: typeof fetch = fetch, now: () => Date = () => new Date()): Promise<RepoStatus[]> {
  const repos = (root.dataset.repos ?? '').split(',').filter(Boolean);
  const snapshot: RepoStatus[] = JSON.parse(root.querySelector('[data-gh-snapshot]')?.textContent ?? '[]');
  const storage = getSessionStorage();
  let rows = readCache(storage, now);
  if (!rows) {
    rows = await loadBoard(repos, fetchImpl, snapshot, now);
    if (rows.some((r) => r.source === 'live')) writeCache(storage, rows, now);
  }
  paint(root, rows, now);
  return rows;
}

export function paint(root: HTMLElement, rows: RepoStatus[], now: () => Date): void {
  for (const r of rows) {
    const tr = root.querySelector<HTMLElement>(`[data-repo="${r.repo}"]`);
    if (!tr) continue;
    tr.dataset.source = r.source;
    const set = (field: string, text: string) => {
      const cell = tr.querySelector<HTMLElement>(`[data-field="${field}"]`);
      if (cell) cell.textContent = text;
    };
    const pushed = tr.querySelector<HTMLElement>('[data-field="pushedAt"]');
    if (pushed) {
      pushed.dataset.iso = r.pushedAt;
      pushed.textContent = `${relativeTime(r.pushedAt, now())}`;
      pushed.title = shortIsoDate(r.pushedAt);
    }
    const ci = tr.querySelector<HTMLElement>('[data-field="ci"]');
    if (ci) {
      ci.className = `gh__ci gh__ci--${r.ci}`;
      const label = ci.querySelector('span') ?? ci;
      label.textContent = CI_WORDS[r.ci];
    }
    set('stars', String(r.stars));
    set('openIssues', String(r.openIssues));
    set('licence', r.licence ?? '—');
  }
  const caption = root.querySelector<HTMLElement>('[data-gh-caption]');
  const liveCount = rows.filter((r) => r.source === 'live').length;
  if (caption) {
    if (liveCount === rows.length && rows.length > 0) caption.textContent = `Live from GitHub, ${now().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`;
    else if (liveCount > 0) caption.textContent = `Live from GitHub for ${liveCount} of ${rows.length}; the rest from the snapshot taken ${shortIsoDate(root.dataset.snapshotDate ?? '')}.`;
    else caption.textContent = `GitHub did not answer, so this is the snapshot taken ${shortIsoDate(root.dataset.snapshotDate ?? '')}.`;
  }
}
