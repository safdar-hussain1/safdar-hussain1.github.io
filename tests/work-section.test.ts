import { describe, expect, test } from 'vitest';
import { readDoc } from './helpers/html';

const html = readDoc();
const whole = html.match(/<section id="projects"[\s\S]*?<\/section>/)![0];
// The city's own data lists every entry, scenery included; the cards and the rail do not.
const stageData = whole.match(/<script type="application\/json" data-stage-entries>([\s\S]*?)<\/script>/);
const section = whole.replace(/<script type="application\/json" data-stage-entries>[\s\S]*?<\/script>/, '');
const plates = [...section.matchAll(/<article class="plate"[^>]*data-slug="([^"]+)"[^>]*data-status="([^"]+)"[\s\S]*?<\/article>/g)].map((m) => ({ slug: m[1], status: m[2], html: m[0] }));

describe('work section', () => {
  test('the six live projects in spec order, and nothing unshipped', () => {
    expect(plates.map((p) => p.slug)).toEqual(['wardos', 'nightingale', 'trafficlens', 'red-light-green-light-cv', 'carmine', 'homecast']);
    expect(plates.every((p) => p.status === 'live')).toBe(true);
    expect(section).not.toContain('wavelength');
    expect(section).not.toContain('sightline');
    expect(section).toContain('1 of 6');
    expect(section).toMatch(/<h2 id="projects-title"[^>]*>Six products, each one running live<\/h2>/);
  });

  test('the city data carries all eight entries with their building and status', () => {
    expect(stageData).not.toBeNull();
    const entries = JSON.parse(stageData![1]) as Array<{ slug: string; building: string; status: string; accent: string }>;
    expect(entries.map((e) => e.slug).sort()).toEqual(['carmine', 'homecast', 'nightingale', 'red-light-green-light-cv', 'sightline', 'trafficlens', 'wardos', 'wavelength']);
    expect(entries.filter((e) => e.status === 'scenery').map((e) => e.slug).sort()).toEqual(['sightline', 'wavelength']);
    expect(new Set(entries.map((e) => e.building)).size).toBe(8);
    expect(entries.every((e) => /^#[0-9a-f]{6}$/.test(e.accent))).toBe(true);
    expect(whole).toContain('style="--stops:6"');
  });

  test('every card has a dock link with its live URL, a lazy poster and both loops ready to add', () => {
    for (const p of plates) {
      expect(p.html).toContain(`data-dock="${p.slug}" href="https://safdar-hussain1.github.io/${p.slug}/"`);
      expect(p.html).toContain(`data-poster="/work/${p.slug}/poster.webp"`);
      expect(p.html).toContain(`data-loop-webm="/work/${p.slug}/loop.webm"`);
      expect(p.html).toContain(`data-loop-mp4="/work/${p.slug}/loop.mp4"`);
      expect(p.html).toContain(`srcset="/work/${p.slug}/poster-sm.webp 800w, /work/${p.slug}/poster.webp 1600w"`);
      expect(p.html).toContain(`href="/work/${p.slug}/"`);
      expect(p.html).not.toContain('<video');
    }
    expect(plates[0].html).toContain('loading="eager"');
    expect(plates[1].html).toContain('loading="lazy"');
  });

  test('camera chips only where needs.camera', () => {
    const withCamera = plates.filter((p) => p.html.includes('Uses your camera')).map((p) => p.slug);
    expect(withCamera).toEqual(['trafficlens', 'red-light-green-light-cv', 'carmine']);
  });

  test('no card says coming soon, and WardOS links Health Haven', () => {
    expect(section.toLowerCase()).not.toContain('coming soon');
    expect(plates.find((p) => p.slug === 'wardos')!.html).toContain('https://github.com/safdar-hussain1/health-haven');
  });

  test('the rail lists the six live stops', () => {
    const rail = section.match(/<nav class="rail"[\s\S]*?<\/nav>/)![0];
    expect([...rail.matchAll(/aria-label="([^"]+)"/g)].map((m) => m[1]).slice(1)).toEqual(['1. WardOS', '2. Nightingale', '3. TrafficLens', '4. Red Light, Green Light', '5. Carmine', '6. HomeCast']);
    expect([...rail.matchAll(/data-slug="([^"]+)"/g)].map((m) => m[1])).toEqual(['wardos', 'nightingale', 'trafficlens', 'red-light-green-light-cv', 'carmine', 'homecast']);
  });
});
