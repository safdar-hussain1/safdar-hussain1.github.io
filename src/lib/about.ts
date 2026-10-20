import about from '../data/about.json';

// The facts about Safdar, typed. `swara` is null until he supplies the entry, and the JSON
// import alone would type it as never-anything-else.
export interface About {
  source: string;
  allowed: string[];
  now: { date: string; text: string };
  /** One line in his own words; the source names where it was said. */
  quote: { text: string; source: string };
  paragraphs: string[];
  facts: Array<{ label: string; text: string }>;
  outside: string;
  swara: { text: string; href: string } | null;
}

export const aboutData: About = about as unknown as About;
