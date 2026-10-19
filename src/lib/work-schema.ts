import { z } from 'astro/zod';

// One entry per project. Every figure shown about a project comes from `facts[].quote`,
// a substring copied word for word from the project's README; a test fetches the README
// and fails if the quote is not there.
export const buildingKinds = ['hospital', 'clinic', 'gantry', 'field', 'studio', 'towers', 'hall', 'depot'] as const;

// Every link in an entry is https; the README is fetched, so its host is pinned too.
const httpsUrl = z.url().refine((u) => new URL(u).protocol === 'https:', 'must be an https: URL');
const readmeUrl = httpsUrl.refine((u) => new URL(u).host === 'raw.githubusercontent.com', 'must be on raw.githubusercontent.com');
const liveUrl = httpsUrl.refine((u) => new URL(u).host === 'safdar-hussain1.github.io', 'must be on safdar-hussain1.github.io');
const plain = (max: number) => z.string().min(1).max(max).regex(/^[^<>]*$/, 'no angle brackets');

export const workSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: plain(40),
  order: z.number().int().min(1).max(8),
  accent: z.string().regex(/^#[0-9a-f]{6}$/),
  accentInk: z.object({ dark: z.string().regex(/^#[0-9a-f]{6}$/), light: z.string().regex(/^#[0-9a-f]{6}$/) }),
  tagline: plain(120).refine((t) => t.length >= 10, 'at least ten characters'),
  live: liveUrl,
  repo: httpsUrl,
  readme: readmeUrl,
  building: z.enum(buildingKinds),
  needs: z.object({ camera: z.boolean(), webgl: z.boolean() }),
  runsOnDevice: z.boolean(),
  facts: z.array(z.object({ text: z.string().min(1), quote: z.string().min(1), source: httpsUrl })),
  limits: z.string(),
  stack: z.array(z.string()),
  status: z.enum(['live', 'scenery']),
  related: z.object({ label: z.string(), href: httpsUrl }).optional(),
});

export type WorkEntry = z.infer<typeof workSchema>;
