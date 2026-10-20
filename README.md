# safdar-hussain1.github.io

[![tests](https://github.com/safdar-hussain1/safdar-hussain1.github.io/actions/workflows/tests.yml/badge.svg)](https://github.com/safdar-hussain1/safdar-hussain1.github.io/actions/workflows/tests.yml)
[![licence: MIT](https://img.shields.io/badge/licence-MIT-lightgrey)](LICENSE)

The source of **https://safdar-hussain1.github.io/**, Safdar Hussain's portfolio. Every
project on it is a complete product with its own live site, and the portfolio runs each one
*inside* the page: press **Use it here** and the real app opens in a same-origin frame, with
its camera, its models and its database. Nothing on the page is a video of a product.

The front page is a portfolio: who I am, the projects, how I work, the measured results,
experience, skills, about and contact. The **3D city** is its own page, `/city/`: a glass
lens floats over the name, and below it every project is a building with its own page
playing on the facade. Scrolling takes the camera down through the lens and along the road,
stopping at each building, and **Use it here** flies into the facade before the app opens.
Everything in the city is built in code from boxes, cylinders and cones; there are no model
files.

## What is on the page

| Section | What it does |
|---|---|
| **Hero** | The name, the one-line pitch, *See the projects* and *Explore the 3D city*, four facts on a rule, and a picture of the city rendered from the same scene the city page runs |
| **Projects** | One card per live project, with a loop of the real page, its stack, and two actions: *Use it here* (docks the live app in the page on a desktop; opens it on a phone) and *Read more* (a page per project with the app at the top and the measured facts under it) |
| **How I work** | Four numbered rules, each with one measured fact and the README line it is quoted from |
| **Measured** | A ledger, one row per project: the README's figures on the left, quoted word for word, and GitHub's own figures on the right, fetched live with a dated snapshot as the fallback |
| **Experience** | A CV newest first, with the role, the dates and the confirmed points of each entry |
| **Skills** | The tools in three tiers, graded the way I would grade myself: could teach (each with the product on this page that proves it), every week, have shipped with; and the certificates |
| **Practice** | The problems I have solved, in LeetCode's own figures from a dated snapshot: the total split by difficulty, the topics, the languages, and a link to the profile |
| **About**, **Contact** | One line of mine, the story and a profile card with the facts; then a contact band with the email, the links and a form that opens your mail app |
| **The city** (`/city/`) | On a wide screen with a GPU: the lens over the name, then one building per project along a road, its live page on the facade screen, the cards as captions, a rail of stops at the right (arrow keys and digits move along it). The frame rate is measured once after the start; a slow machine loses the shadows, then the moving traffic, then the city itself and keeps the cards |
| **The palette** | Press `/` anywhere (or Ctrl/Cmd-K) to jump to any project, section or link, switch the theme or the sound |

The site is dark; a switch turns it light (white surfaces, slate ink, the same gradient; the
contact band and the footer stay dark) and the choice is remembered. The city is lit at night on the dark theme and stands in daylight on the light one. Sound is off until you turn
it on. Phones open the live sites directly instead of framing them, and on the city page they
keep the cards; a tablet gets the lens alone; reduced motion, Save-Data and a browser without
hardware WebGL2 also keep the cards. Every word on every page is in the HTML whether or not
the city runs.

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
#   Result (117 files): - 0 errors / - 0 warnings
npm run build                            # writes docs/
#   9 page(s) built in 1.49s · Complete!
npm test                                 # vitest over the helpers and the built docs/
#   Test Files  28 passed (28) · Tests  357 passed (357)
node scripts/serve.mjs --port 4300       # the site at / and each project at /<repo>/
#   Serving http://127.0.0.1:4300  / -> docs  /homecast/ -> ../1-homecast/docs  /nightingale/ -> ../2-nightingale/docs  /red-light-green-light-cv/ -> ../3-red-light-green-light-cv/docs  /wardos/ -> ../4-wardos/docs  /carmine/ -> ../5-carmine/docs  /trafficlens/ -> ../6-trafficlens/docs
node scripts/e2e.mjs                     # browser flows + axe against the running server
#   ok   home-dark · ok   home-light · ok   home-390 · ok   project-page · ok   dock · ok   palette · ok   reduced-motion · ok   stage (skipped: needs E2E_GL=1 and a GPU) · ok   tour (skipped) · ok   selftest · PASS 10/10 on chrome
E2E_GL=1 node scripts/e2e.mjs --only stage,tour   # the city page on the real GPU: the canvas, the ladder, a stop, the keys, the dock from a facade
#   ok   stage · ok   tour · PASS 2/2 on chrome
E2E_GL=1 node scripts/stage-shot.mjs --stops      # screenshots of the hero and every stop (add --light, --width 768)
#   wrote …/hero-dark.png · wrote …/stop-0-dark.png · … · wrote …/stop-5-dark.png
E2E_GL=1 node scripts/stage-walk.mjs              # frames of the dive, the road, a dock from a facade and the end of the road
node scripts/snapshot-github.mjs         # refresh src/data/github-snapshot.json through gh
#   homecast  stars 1  issues 0  MIT  passing  pushed 2026-10-06T19:11:09Z   (one line per repo)
#   Wrote src/data/github-snapshot.json: 6 repositories, fetched 2026-10-19T18:16:20.504Z
node scripts/snapshot-leetcode.mjs       # refresh src/data/leetcode-snapshot.json from LeetCode's public figures
#   safdar-hussain1: 55 solved (28 easy, 26 medium, 1 hard) of 4086; Java 53, C++ 2, Python 1
#   Wrote src/data/leetcode-snapshot.json, fetched 2026-10-20T09:27:53.594Z
node scripts/still.mjs [home|<slug>…]    # preview pictures from the city (needs the GPU): og-image.png, hero-still.webp and work/<slug>/og.png
#   public/og-image.png  75 KB · public/hero-still.webp  47 KB · public/hero-still-sm.webp  19 KB · public/work/carmine/og.png  236 KB · … (nine files)
node scripts/capture.mjs [<slug>…]       # posters and 8 s loops of the live pages, on the GPU
#   wardos: poster.webp 74 KB · loop.webm 284 KB · loop.mp4 170 KB · manifest.json
node scripts/shot.mjs URL OUTDIR         # dark, light and 390 px screenshots of any page
```

`npm test` reads `docs/`, so build first. The two snapshot scripts, `still.mjs` and `capture.mjs`
overwrite committed inputs; run them on purpose and commit what they write. The captures take
about four minutes for all six and need Chrome with its GPU, a full `ffmpeg` and the live pages.
The city's own checks (`E2E_GL=1`) need the GPU too: without one, Chrome renders WebGL in
software and the page keeps the flat site, which is what the plain flows exercise.

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
  data/              facts about me, the timeline, certificates, skills, the GitHub and LeetCode snapshots
  layouts/Base.astro the head of every page: metadata, fonts, theme, authorship marks
  components/        masthead, hero, project cards, dock, the ledger, experience, skills, practice, about, contact, palette
  pages/             the home page, the city page, a page per project, robots.txt, sitemap.xml, the 404 page
  scripts/           browser modules: theme, dock, palette, sound, GitHub board, selftest
  scripts/stage/     the city: the lens, the name, the ground, the buildings, the facade screens,
                     the traffic, the camera on its rails, the dock fly, the drive; stage-loader.ts
                     decides whether it runs and loads it after the page has painted
  lib/               pure helpers with tests
  styles/            tokens (both themes), the base styles, the stage's styles
public/              favicon, the preview pictures, the hero picture, work/<slug>/ posters and loops
scripts/             capture, the two snapshots, serve, e2e (browser flows + axe), still, shot, stage-shot, stage-walk
tests/               vitest: schema, numbers, metadata, guards, dock, palette, flows' helpers
docs/                the built site, committed, served by GitHub Pages
```

## Tech

Astro, TypeScript, Three.js for the city (procedural geometry, no model files) and GSAP for
its few tweens, loaded only when the city will run; Vitest, playwright-core driving the
installed Chrome, axe-core, sharp; Archivo and Newsreader (both SIL Open Font License) bundled
from Fontsource; the GitHub REST API for the live board. Everything is free; see `NOTICE`.
MIT licence.
