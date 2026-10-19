import { z } from 'astro/zod';

// One entry per project. Every figure shown about a project comes from `facts[].quote`,
// a substring copied word for word from the project's README; a test fetches the README
// and fails if the quote is not there.
export const buildingKinds = ['hospital', 'clinic', 'gantry', 'field', 'studio', 'towers', 'hall', 'depot'] as const;

// Every link in an entry is https; the README is fetched, so its host is pinned too.
const httpsUrl = z.string().url().refine((u) => new URL(u).protocol === 'https:', 'must be an https: URL');
const readmeUrl = httpsUrl.refine((u) => new URL(u).host === 'raw.githubusercontent.com', 'must be on raw.githubusercontent.com');

export const workSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  order: z.number().int().min(1).max(8),
  accent: z.string().regex(/^#[0-9a-f]{6}$/),
  accentInk: z.object({ dark: z.string().regex(/^#[0-9a-f]{6}$/), light: z.string().regex(/^#[0-9a-f]{6}$/) }),
  tagline: z.string().min(10).max(120),
  live: httpsUrl,
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
