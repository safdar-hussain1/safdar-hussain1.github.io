import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { workSchema } from './lib/work-schema';

export const collections = {
  work: defineCollection({ loader: glob({ pattern: '*.json', base: './src/content/work' }), schema: workSchema }),
};
