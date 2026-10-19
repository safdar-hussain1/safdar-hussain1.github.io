import { reportSelftest, runSelftest, type SelftestContext } from './selftest';

type W = Window & { __dock?: SelftestContext['dock']; __palette?: SelftestContext['palette']; __stage?: SelftestContext['stage'] };

if (/[?&]selftest=1\b/.test(location.search)) {
  const w = window as unknown as W;
  const start = () =>
    runSelftest({ document, dock: w.__dock ?? null, palette: w.__palette ?? null, stage: w.__stage ?? null }).then((r) => reportSelftest(r));
  // Other modules register their handles on load; run after them.
  if (document.readyState === 'complete') setTimeout(start, 50);
  else window.addEventListener('load', () => setTimeout(start, 50));
}
