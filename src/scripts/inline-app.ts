import { mountFrame, type MountedFrame } from './frame';
import { SITE } from '../data/site';

// On a project page the app itself replaces the poster on a wide screen; phones keep the
// poster and the link. If the app does not start inside the page, the poster comes back with
// a note and the link to its own tab.
export function mountInlineApps(doc: Document = document): void {
  if (!matchMedia('(min-width: 900px)').matches) return;
  for (const el of Array.from(doc.querySelectorAll<HTMLElement>('[data-inline-app]'))) {
    const stage = el.querySelector<HTMLElement>('[data-app-stage]');
    const poster = el.querySelector<HTMLElement>('[data-app-poster]');
    const note = el.querySelector<HTMLElement>('[data-app-note]');
    if (!stage || !poster) continue;
    let mounted: MountedFrame | null = null;
    const giveUp = () => {
      mounted?.destroy();
      mounted = null;
      stage.classList.remove('app__stage--live');
      poster.hidden = false;
      if (note) note.hidden = false;
    };
    poster.hidden = true;
    stage.classList.add('app__stage--live');
    mounted = mountFrame({
      stage,
      path: el.dataset.frame || el.dataset.live!,
      title: `${el.dataset.name}, running in this page`,
      siteUrl: SITE.url,
      onTimeout: giveUp,
      onBroken: giveUp,
    });
  }
}
