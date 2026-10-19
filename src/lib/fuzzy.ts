/**
 * Matching for the command palette. A query matches when its letters appear in
 * the text in order, with gaps allowed, and the score favours the places a
 * person looks first: the starts of words and unbroken runs of letters.
 */

/** The order the palette lists its groups in. */
export const GROUPS = ['project', 'section', 'link', 'action'] as const;
export type Group = (typeof GROUPS)[number];

export type Command = {
  id: string;
  label: string;
  /** Shown beside the label; never matched against. */
  hint?: string;
  group: Group;
  /** Extra words that should find the command, such as "audio" for the sound switch. */
  keywords?: string[];
};

const LETTER = 1; // every matched letter
const WORD_START = 2; // extra, when the letter begins a word
const ADJACENT = 1; // extra, when the letter directly follows the previous match

// A letter right after one of these begins a word. The first letter always does.
const WORD_BREAKS = new Set([' ', '-', '/']);

const startsWord = (chars: string[], i: number) => i === 0 || WORD_BREAKS.has(chars[i - 1]);

/**
 * How well `query` matches `text`: 0 when its letters do not appear in order,
 * otherwise a positive score where higher is better. Case is ignored, and so are
 * spaces typed in the query, so "ward os" still finds "WardOS".
 *
 * Every letter is placed where it scores best rather than where it is first
 * found: "wo" scores "Show Work" for the word Work, not for the w inside Show.
 *
 * Among texts with equal letter scores the shorter one scores higher. That part
 * is a fraction below 1, so it can never outweigh a real difference in letters.
 * An empty query matches any text and scores only that fraction.
 */
export function fuzzyScore(query: string, text: string): number {
  const wanted = Array.from(query.toLowerCase()).filter((char) => char.trim() !== '');
  const chars = Array.from(text.toLowerCase());
  const shorterWins = 1 / (chars.length + 1);

  if (wanted.length === 0) return shorterWins;
  if (wanted.length > chars.length) return 0;

  // best[j]: the highest score so far when the latest query letter sits at
  // chars[j], or -Infinity where it cannot sit.
  let best: number[] = [];
  for (let k = 0; k < wanted.length; k++) {
    const next = new Array<number>(chars.length).fill(-Infinity);
    // The best of best[0..j-2]: placing a letter at j after any of these is not adjacent.
    let apart = -Infinity;
    for (let j = 0; j < chars.length; j++) {
      if (k > 0 && j >= 2) apart = Math.max(apart, best[j - 2]);
      if (chars[j] !== wanted[k]) continue;

      const before = k === 0 ? 0 : Math.max(apart, j > 0 ? best[j - 1] + ADJACENT : -Infinity);
      if (before === -Infinity) continue;
      next[j] = before + LETTER + (startsWord(chars, j) ? WORD_START : 0);
    }
    best = next;
  }

  const top = best.reduce((a, b) => Math.max(a, b), -Infinity);
  return top === -Infinity ? 0 : top + shorterWins;
}

/**
 * The commands that match `query`, best first. Each command is scored on its
 * label and on each keyword, and the best of those counts; commands that match
 * nothing are dropped. Equal scores fall back to label order.
 *
 * With an empty or blank query every command is returned, grouped in the order
 * of GROUPS and otherwise in the order given. The input list is never changed.
 */
export function rankCommands(query: string, commands: Command[]): Command[] {
  if (query.trim() === '') {
    // sort is stable, so commands keep their given order within a group
    return [...commands].sort((a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group));
  }

  const scored: { command: Command; score: number }[] = [];
  for (const command of commands) {
    const score = Math.max(
      fuzzyScore(query, command.label),
      ...(command.keywords ?? []).map((keyword) => fuzzyScore(query, keyword)),
    );
    if (score > 0) scored.push({ command, score });
  }

  return scored
    .sort((a, b) => b.score - a.score || a.command.label.localeCompare(b.command.label, 'en'))
    .map(({ command }) => command);
}
