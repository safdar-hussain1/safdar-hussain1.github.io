import type { WorkEntry } from './work-schema';

export function allEntries(entries: WorkEntry[]): WorkEntry[] {
  return [...entries].sort((a, b) => a.order - b.order);
}

export function liveEntries(entries: WorkEntry[]): WorkEntry[] {
  return allEntries(entries).filter((e) => e.status === 'live');
}

export function entryBySlug(entries: WorkEntry[], slug: string): WorkEntry | undefined {
  return entries.find((e) => e.slug === slug);
}
