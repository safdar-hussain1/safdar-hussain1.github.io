import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const DOCS = join(process.cwd(), 'docs');

export function readDoc(path = 'docs/index.html'): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

export function meta(html: string, nameOrProperty: string): string | null {
  const re = new RegExp(`<meta\\s+(?:name|property)="${nameOrProperty}"\\s+content="([^"]*)"`);
  const m = html.match(re);
  return m ? m[1] : null;
}

export function jsonLd(html: string): Record<string, unknown> {
  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('no JSON-LD block');
  return JSON.parse(m[1]);
}

export function shippedScripts(): string {
  const dir = join(DOCS, '_astro');
  let out = '';
  for (const f of readdirSync(dir)) if (f.endsWith('.js')) out += readFileSync(join(dir, f), 'utf8');
  return out;
}

export function count(html: string, re: RegExp): number {
  return (html.match(re) ?? []).length;
}
