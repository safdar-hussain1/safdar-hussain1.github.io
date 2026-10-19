import { describe, expect, test } from 'vitest';
import { readDoc } from './helpers/html';

const html = readDoc();
const section = html.match(/<section id="work"[\s\S]*?<\/section>/)![0];
const plates = [...section.matchAll(/<article class="plate"[^>]*data-slug="([^"]+)"[^>]*data-status="([^"]+)"[\s\S]*?<\/article>/g)].map((m) => ({ slug: m[1], status: m[2], html: m[0] }));

describe('work section', () => {
  test('six live cards and two scenery cards in spec order', () => {
    expect(plates.map((p) => p.slug)).toEqual(['wardos', 'nightingale', 'trafficlens', 'red-light-green-light-cv', 'carmine', 'homecast', 'wavelength', 'sightline']);
    expect(plates.map((p) => p.status)).toEqual(['live', 'live', 'live', 'live', 'live', 'live', 'scenery', 'scenery']);
  });

  test('every live card has a dock link with its live URL, a poster and both loop sources', () => {
    for (const p of plates.filter((p) => p.status === 'live')) {
      expect(p.html).toContain(`data-dock="${p.slug}" href="https://safdar-hussain1.github.io/${p.slug}/"`);
      expect(p.html).toContain(`poster="/work/${p.slug}/poster.webp"`);
      expect(p.html).toContain(`src="/work/${p.slug}/loop.webm"`);
      expect(p.html).toContain(`src="/work/${p.slug}/loop.mp4"`);
      expect(p.html).toContain(`href="/work/${p.slug}/"`);
    }
  });

  test('scenery cards carry no actions and no media', () => {
    for (const p of plates.filter((p) => p.status === 'scenery')) {
      expect(p.html).not.toContain('data-dock');
      expect(p.html).not.toContain('<video');
    }
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
    expect([...rail.matchAll(/aria-label="([^"]+)"/g)].map((m) => m[1]).slice(1)).toEqual(['WardOS', 'Nightingale', 'TrafficLens', 'Red Light, Green Light', 'Carmine', 'HomeCast']);
  });
});
