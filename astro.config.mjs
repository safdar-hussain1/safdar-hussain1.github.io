import { defineConfig } from 'astro/config';

// The site is served by GitHub Pages from the main branch's docs/ folder, so the
// build writes there and the output is committed. HTML stays uncompressed so a
// diff of docs/ reads like a diff.
export default defineConfig({
  site: 'https://safdar-hussain1.github.io',
  outDir: './docs',
  build: { format: 'directory', assets: '_astro' },
  compressHTML: false,
});
