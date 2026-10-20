import { describe, expect, test } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import about from '../src/data/about.json';
import timeline from '../src/data/timeline.json';
import skills from '../src/data/skills.json';
import { readDoc } from './helpers/html';
import { privateRuns } from './helpers/private';

const html = readDoc();
const section = (id: string) => html.match(new RegExp(`<section id="${id}"[\\s\\S]*?<\\/section>`))![0];

describe('how I work, experience, skills, about and contact', () => {
  test('how i work has four principles each with a README link', () => {
    const how = section('how');
    expect((how.match(/<h3[\s>]/g) ?? []).length).toBe(4);
    expect((how.match(/href="https:\/\/github\.com\/safdar-hussain1\/[a-z-]+#readme"/g) ?? []).length).toBe(4);
    for (const t of ['Measure, don’t claim', 'Break it on purpose', 'Publish the bad number', 'It runs on your device']) expect(how).toContain(t);
  });

  test('experience renders the seven items newest first, each with its kind, role and points', () => {
    const tl = section('experience');
    const items = tl.match(/<li class="exp__row exp__row--(work|education|community|talk)/g) ?? [];
    expect(items).toHaveLength(7);
    const titles = [...tl.matchAll(/<h3[^>]*>([^<]+)<\/h3>/g)].map((m) => m[1]);
    expect(titles).toEqual([...timeline].reverse().map((t) => t.title));
    expect((tl.match(/<p class="exp__role"/g) ?? []).length).toBe(timeline.length);
    expect(tl).toContain('Jul 2026 – now');
    expect(tl).toContain('Jun 2025 – Aug 2025');
    const points = timeline.flatMap((t) => ('points' in t ? (t.points as string[]) : []));
    expect(points.length).toBeGreaterThan(0);
    for (const p of points) expect(tl).toContain(p.replace(/'/g, '&#39;'));
    expect(tl).toContain('exp__row--now');
  });

  test('skills shows the three tiers, the proofs, every chip and every certificate', () => {
    const sk = section('skills');
    for (const t of ['Could teach', 'Every week', 'Have shipped with']) expect(sk).toContain(`>${t}</h3>`);
    for (const s of skills.teach) expect(sk).toContain(`>${s.name.replace(/'/g, '&#39;')}</h4>`);
    for (const g of skills.weekly) expect(sk).toContain(`>${g.name}</h4>`);
    for (const item of ['LangGraph', 'FastAPI', 'Three.js', 'GeoPandas']) expect(sk).toContain(`>${item}</li>`);
    const chips = (sk.match(/<li class="chip chip--plain/g) ?? []).length;
    expect(chips).toBe(skills.weekly.reduce((n, g) => n + g.items.length, 0) + skills.also.length);
    // Each proof is a live project on this page, linked by its page.
    expect(sk).toContain('href="/work/homecast/"');
    expect(sk).toContain('href="/work/trafficlens/"');
    expect(sk).not.toContain('/work/sightline/');
    for (const c of ['Advanced Learning Algorithms', 'CS50&#39;s Introduction to Programming with Python', 'Harvard']) expect(sk).toContain(c);
  });

  test('about shows his line, the dated note, CGPA 9.19 and the scholarship, and no phone number', () => {
    const ab = section('about');
    expect(ab).toContain(`October 2026 · ${about.now.text}`);
    expect(ab).toContain(about.quote.text);
    expect(ab).toContain('CGPA 9.19');
    expect(ab).toContain('Academic Scholarship all four years');
    for (const l of ['Telugu', 'Hindi', 'English']) expect(ab).toContain(`>${l}</li>`);
    expect(privateRuns(html)).toEqual([]);
  });

  test('swara entry is absent while the data is null', () => {
    expect(section('about')).not.toContain('Swara');
  });

  test('contact shows the email and the two links', () => {
    const c = section('contact');
    expect(c).toContain('safdarhussaindudekula@gmail.com');
    expect(c).toContain('href="https://github.com/safdar-hussain1"');
    expect(c).toContain('href="https://www.linkedin.com/in/safdar-hussain-a8a61b248"');
    expect(c).toContain('id="copy-email"');
    expect(c).toMatch(/Let's build something that runs on <em class="em"[^>]*>your device<\/em>\./);
    // The form opens the visitor's mail app; without scripts its own action does the same.
    expect(c).toMatch(/<form class="contact__form" action="mailto:safdarhussaindudekula@gmail\.com" method="post" enctype="text\/plain"/);
    for (const name of ['name', 'email', 'message']) expect(c).toContain(`name="${name}"`);
    expect(c).toContain('Nothing is stored here.');
    expect(c).toContain('Hyderabad, India.');
    expect(c).toContain('Send message');
  });

  test('the footer carries the sections, the links and the credit', () => {
    const foot = html.match(/<footer class="foot[^"]*"[\s\S]*?<\/footer>/)![0];
    for (const h of ['/#projects', '/#experience', '/#skills', '/#practice', '/#about', '/#contact', '/city/']) expect(foot).toContain(`href="${h}"`);
    expect(foot).toContain('href="https://leetcode.com/u/safdar-hussain1/"');
    expect(foot).toMatch(/Source on GitHub<\/a>/);
    expect(foot).toMatch(/built by Safdar Hussain/i);
    expect(foot).toContain('All rights reserved.');
  });

  test('no all-caps labels anywhere in the shipped styles', () => {
    const cssDir = join(process.cwd(), 'docs/_astro');
    const css = readdirSync(cssDir)
      .filter((f) => f.endsWith('.css'))
      .map((f) => readFileSync(join(cssDir, f), 'utf8'))
      .join('\n');
    expect(css).not.toMatch(/text-transform:\s*uppercase/);
  });
});
