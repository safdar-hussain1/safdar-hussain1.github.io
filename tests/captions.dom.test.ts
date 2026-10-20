import { describe, expect, test } from 'vitest';
import { Window } from 'happy-dom';
import { createCaptions } from '../src/scripts/captions';

// The captions are the work cards under the city: found by slug, one active at a time, the
// rail in step, the page's accent following the project in the tint of the current theme,
// and the keyboard carried from one caption to the next.
function page() {
  const win = new Window();
  const doc = win.document;
  doc.body.innerHTML = `
    <div class="work__list">
      <article class="plate" data-slug="wardos" data-status="live" data-accent="#0369a1" data-accent-ink="#3084b2" data-accent-ink-light="#0369a1"><a class="btn" data-dock="wardos" href="/wardos/">Use it here</a><a href="/work/wardos/">Read more</a><a href="/health-haven/">Also as a Java desktop system</a></article>
      <article class="plate" data-slug="carmine" data-status="live" data-accent="#a4133c" data-accent-ink="#c15f7a" data-accent-ink-light="#a4133c"><a class="btn" data-dock="carmine" href="/carmine/">Use it here</a><a href="/work/carmine/">Read more</a></article>
    </div>
    <nav class="rail"><button data-i="0" aria-current="false"></button><button data-i="1" aria-current="false"></button></nav>`;
  return { win, doc: doc as unknown as Document, body: doc.body as unknown as HTMLElement };
}

describe('captions', () => {
  test('setActive by slug marks the plate and its rail tick', () => {
    const { body, doc } = page();
    const c = createCaptions(body, () => 'dark');
    c.setActive('carmine');
    expect(doc.querySelector('.plate.on')?.getAttribute('data-slug')).toBe('carmine');
    expect(doc.querySelector('.rail button[aria-current="true"]')?.getAttribute('data-i')).toBe('1');
    expect(c.active()).toBe('carmine');
    c.setActive('nowhere');
    expect(c.active()).toBe('carmine');
    c.clear();
    expect(doc.querySelector('.plate.on')).toBeNull();
    expect(c.active()).toBeNull();
  });

  test('the accent takes the tint of the current theme and refresh follows a switch', () => {
    const { body, doc } = page();
    let theme: 'dark' | 'light' = 'dark';
    const c = createCaptions(body, () => theme);
    c.setActive('wardos');
    const root = doc.documentElement as HTMLElement;
    expect(root.style.getPropertyValue('--accent')).toBe('#0369a1');
    expect(root.style.getPropertyValue('--accent-ink')).toBe('#3084b2');
    theme = 'light';
    c.refresh();
    expect(root.style.getPropertyValue('--accent-ink')).toBe('#0369a1');
    c.clear();
    expect(root.style.getPropertyValue('--accent-ink')).toBe('');
  });

  test('focus moves with the caption, and focusing a caption asks for its stop', () => {
    const { body, doc } = page();
    const c = createCaptions(body, () => 'dark');
    const asked: string[] = [];
    c.onFocus((slug) => asked.push(slug));
    c.setActive('wardos');
    const readMore = doc.querySelector<HTMLElement>('.plate[data-slug="wardos"] a[href="/work/wardos/"]')!;
    readMore.focus();
    expect(asked).toEqual([]);
    c.setActive('carmine');
    expect((doc.activeElement as HTMLElement | null)?.getAttribute('href')).toBe('/work/carmine/');
    doc.querySelector<HTMLElement>('.plate[data-slug="wardos"] [data-dock]')!.focus();
    expect(asked).toEqual(['wardos']);
    // A caption with fewer controls takes the focus on its last one, never leaving it unseen.
    c.setActive('wardos');
    doc.querySelector<HTMLElement>('.plate[data-slug="wardos"] a[href="/health-haven/"]')!.focus();
    c.setActive('carmine');
    expect((doc.activeElement as HTMLElement | null)?.getAttribute('href')).toBe('/work/carmine/');
  });
});
