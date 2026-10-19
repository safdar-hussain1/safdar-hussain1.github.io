import { z } from 'astro/zod';

// One entry per project. Every figure shown about a project comes from `facts[].quote`,
// a substring copied word for word from the project's README; a test fetches the README
// and fails if the quote is not there.
export const buildingKinds = ['hospital', 'clinic', 'gantry', 'field', 'studio', 'towers', 'hall', 'depot'] as const;

export const workSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  order: z.number().int().min(1).max(8),
  accent: z.string().regex(/^#[0-9a-f]{6}$/),
  accentInk: z.object({ dark: z.string().regex(/^#[0-9a-f]{6}$/), light: z.string().regex(/^#[0-9a-f]{6}$/) }),
  tagline: z.string().min(10).max(120),
  live: z.string().url(),
  repo: z.string().url(),
  readme: z.string().url(),
  building: z.enum(buildingKinds),
  needs: z.object({ camera: z.boolean(), webgl: z.boolean() }),
  runsOnDevice: z.boolean(),
  facts: z.array(z.object({ text: z.string().min(1), quote: z.string().min(1), source: z.string().url() })),
  limits: z.string(),
  stack: z.array(z.string()),
  status: z.enum(['live', 'scenery']),
  related: z.object({ label: z.string(), href: z.string().url() }).optional(),
});

export type WorkEntry = z.infer<typeof workSchema>;
