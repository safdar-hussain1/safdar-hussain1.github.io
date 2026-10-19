import type { WorkEntry } from './work-schema';

// A project page's search description: the tagline plus one sentence that is true of
// every page here. Between 120 and 160 characters for every entry, which a test checks.
export function describePage(e: Pick<WorkEntry, 'tagline'>): string {
  return `${e.tagline} It runs live on this page; every figure is quoted from its README.`;
}

export function pageTitle(e: Pick<WorkEntry, 'name'>): string {
  return `${e.name} — Safdar Hussain`;
}
