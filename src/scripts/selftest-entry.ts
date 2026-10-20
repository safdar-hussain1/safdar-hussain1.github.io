import { reportSelftest, runSelftest, type SelftestContext } from './selftest';

type W = Window & { __dock?: SelftestContext['dock']; __palette?: SelftestContext['palette']; __stage?: SelftestContext['stage'] };

// The stage decides after load and idle; the selftest waits for that decision (at most 20 s)
// so that it reports the real outcome, never the placeholder.
function stageDecided(w: W): Promise<void> {
  return new Promise((resolve) => {
    if (w.__stage && w.__stage.reason !== 'pending') {
      resolve();
      return;
    }
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(done, 20000);
    document.addEventListener('stage:decided', done, { once: true });
  });
}

if (/[?&]selftest=1\b/.test(location.search)) {
  const w = window as unknown as W;
  const start = () =>
    stageDecided(w)
      .then(() => runSelftest({ document, dock: w.__dock ?? null, palette: w.__palette ?? null, stage: w.__stage ?? null }))
      .then((r) => reportSelftest(r));
  // Other modules register their handles on load; run after them.
  if (document.readyState === 'complete') setTimeout(start, 50);
  else window.addEventListener('load', () => setTimeout(start, 50));
}
