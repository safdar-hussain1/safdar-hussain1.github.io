# safdar-hussain1.github.io

[![tests](https://github.com/safdar-hussain1/safdar-hussain1.github.io/actions/workflows/tests.yml/badge.svg)](https://github.com/safdar-hussain1/safdar-hussain1.github.io/actions/workflows/tests.yml)
[![licence: MIT](https://img.shields.io/badge/licence-MIT-lightgrey)](LICENSE)

The source of **https://safdar-hussain1.github.io/**, Safdar Hussain's portfolio. Every
project on it is a complete product with its own live site, and the portfolio runs each one
*inside* the page: press **Use it here** and the real app opens in a same-origin frame, with
its camera, its models and its database. Nothing on the page is a video of a product.

## What is on the page

| Section | What it does |
|---|---|
| **Work** | One card per live project, with a loop of the real page and two actions: *Use it here* (docks the live app in the page on a desktop; opens it on a phone) and *Read more* (a page per project with the app at the top and the measured facts under it) |
| **How I work** | Four principles, each with one measured fact and the README line it is quoted from |
| **Measured** | The by-the-numbers board, every figure quoted word for word from a project's README, and the GitHub board, fetched live from the GitHub API with a dated snapshot as the fallback |
| **Where I have been**, **About**, **Contact** | The timeline, the facts about me, certificates and skills, and how to reach me |
| **The palette** | Press `/` anywhere (or Ctrl/Cmd-K) to jump to any project, section or link, switch the theme or the sound |

Two themes, following the system setting with a switch to override it. Sound is off until you
turn it on. Phones get every card and open the live sites directly instead of framing them.

## The numbers rule

The site shows figures about a project only as quotes from that project's README. Each
entry in `src/content/work/` carries `facts[].quote`, the exact substring, and every digit in
the sentence shown must appear in it; `tests/numbers.test.ts` fetches the live README and fails
if a quote is not in it. Figures
about me live in `src/data/about.json` and `tests/about-data.test.ts` checks that every digit
on the page comes from there. Nothing is rounded or re-stated.

## Install

Node 22.22 or newer (CI runs 22 and 24), Google Chrome for the browser flows and the
captures, `ffmpeg` and the `gh` CLI for the capture and snapshot scripts.

```bash
git clone https://github.com/safdar-hussain1/safdar-hussain1.github.io.git
cd safdar-hussain1.github.io
npm ci
npm run build          # writes docs/, the folder GitHub Pages serves
npm test               # reads docs/, so build first
```

## Every command

Every line below was run on macOS with Node 23.7 while this file was written; the outputs
shown are real (trimmed where marked). CI runs the same on Linux with Node 22 and 24.

```bash
npm ci                                   # install exactly the locked versions
npm run check                            # astro check: types in .astro and .ts files
#   - 0 errors / - 0 warnings
npm run build                            # writes docs/
#   8 page(s) built in 1.17s · Complete!
npm test                                 # vitest over the helpers and the built docs/
#   Test Files  24 passed (24) · Tests  327 passed (327)
node scripts/serve.mjs --port 4300       # the site at / and each project at /<repo>/
#   Serving http://127.0.0.1:4300  / -> docs  /homecast/ -> ../1-homecast/docs  /nightingale/ -> ../2-nightingale/docs  /red-light-green-light-cv/ -> ../3-red-light-green-light-cv/docs  /wardos/ -> ../4-wardos/docs  /carmine/ -> ../5-carmine/docs  /trafficlens/ -> ../6-trafficlens/docs
node scripts/e2e.mjs                     # browser flows + axe against the running server
#   ok   home-dark · ok   home-light · ok   home-390 · ok   project-page · ok   dock · ok   palette · ok   reduced-motion · ok   selftest · PASS 8/8
node scripts/snapshot-github.mjs         # refresh src/data/github-snapshot.json through gh
#   homecast  stars 1  issues 0  MIT  passing  pushed 2026-10-06T19:11:09Z   (one line per repo)
#   Wrote src/data/github-snapshot.json: 6 repositories, fetched 2026-10-19T18:16:20.504Z
node scripts/still.mjs [home|<slug>…]    # preview pictures: og-image.png and work/<slug>/og.png
#   public/og-image.png  12 KB · public/work/carmine/og.png  236 KB · … (seven files)
node scripts/capture.mjs [<slug>…]       # posters and 8 s loops of the live pages, on the GPU
#   wardos: poster.webp 74 KB · loop.webm 284 KB · loop.mp4 170 KB · manifest.json
node scripts/shot.mjs URL OUTDIR         # dark, light and 390 px screenshots of any page
```

`npm test` reads `docs/`, so build first. `snapshot-github.mjs`, `still.mjs` and `capture.mjs`
overwrite committed inputs; run them on purpose and commit what they write. The captures take
about four minutes for all six and need Chrome with its GPU, a full `ffmpeg` and the live pages.

## How to view it

`docs/` is a static site, but the dock needs the projects on the same origin, so the local
server mounts each project's built site beside it, exactly as GitHub Pages does:

```bash
node scripts/serve.mjs --port 4300     # / -> docs, /wardos/ -> ../wardos/docs, and so on
open http://127.0.0.1:4300/
```

The six project repositories are expected next to this one, each with its `docs/` built
(their names, numbered as in the workspace, are listed at the top of `scripts/serve.mjs`).
Without them the portfolio still serves; a project that is missing, or answers with a bare
error page, gets the dock's fallback (its poster and a link to its own tab).

## Repository

```
src/
  content/work/      one JSON entry per project: facts quoted from its README, links, accent
  content.config.ts  the collection and its schema (src/lib/work-schema.ts)
  data/              facts about me, the timeline, certificates, skills, the GitHub snapshot
  layouts/Base.astro the head of every page: metadata, fonts, theme, authorship marks
  components/        masthead, hero, work cards, dock, boards, timeline, about, contact, palette
  pages/             the home page, a page per project, robots.txt, sitemap.xml, the 404 page
  scripts/           browser modules: theme, dock, palette, sound, GitHub board, selftest
  lib/               pure helpers with tests
  styles/            tokens (both themes) and the base styles
public/              favicon, the preview pictures, work/<slug>/ posters and loops
scripts/             capture, snapshot, serve, e2e (browser flows + axe), still, shot
tests/               vitest: schema, numbers, metadata, guards, dock, palette, flows' helpers
docs/                the built site, committed, served by GitHub Pages
```

## Tech

Astro, TypeScript, Vitest, playwright-core driving the installed Chrome, axe-core, sharp;
Archivo and Newsreader (both SIL Open Font License) bundled from Fontsource; the GitHub REST
API for the live board. Everything is free; see `NOTICE`. MIT licence.
