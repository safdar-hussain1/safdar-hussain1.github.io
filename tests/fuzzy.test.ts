import { describe, expect, it } from 'vitest';
import { fuzzyScore, rankCommands, type Command } from '../src/lib/fuzzy';

// The whole-number part of a score is what the matched letters earned; the
// fraction is the shorter-text tie-break and never reaches 1.
const earned = (query: string, text: string) => Math.floor(fuzzyScore(query, text));

const ids = (list: Command[]) => list.map((command) => command.id);

// Deliberately not in group order, so grouping has something to do.
const commands: Command[] = [
  { id: 'toggle-sound', label: 'Toggle sound', group: 'action', keywords: ['audio', 'mute'] },
  { id: 'open-linkedin', label: 'Open LinkedIn', group: 'link' },
  { id: 'go-work', label: 'Work', group: 'section', hint: 'Jump to' },
  { id: 'dock-wardos', label: 'WardOS', group: 'project', keywords: ['hospital'] },
  { id: 'switch-theme', label: 'Switch theme', group: 'action', keywords: ['dark', 'light'] },
  { id: 'dock-homecast', label: 'Homecast', group: 'project' },
  { id: 'open-github', label: 'Open GitHub', group: 'link', keywords: ['source', 'code'] },
  { id: 'go-about', label: 'About', group: 'section' },
];

describe('fuzzyScore', () => {
  it('ignores case in both the query and the text', () => {
    expect(fuzzyScore('WARD', 'wardos')).toBeGreaterThan(0);
    expect(fuzzyScore('WARD', 'wardos')).toBe(fuzzyScore('ward', 'WARDOS'));
  });

  it('is 0 unless the query is a subsequence of the text, in order', () => {
    expect(fuzzyScore('zq', 'WardOS')).toBe(0);
    expect(fuzzyScore('dw', 'WardOS')).toBe(0); // both letters exist, but not in that order
    expect(fuzzyScore('wardox', 'WardOS')).toBe(0); // the last letter is missing
    expect(fuzzyScore('ward', 'wa')).toBe(0); // longer than the text
    expect(fuzzyScore('wrd', 'WardOS')).toBeGreaterThan(0); // letters may sit apart
  });

  it('scores a point per letter, two more at a word start and one beside the previous match', () => {
    expect(earned('x', 'axb')).toBe(1); // inside a word
    expect(earned('x', 'xa')).toBe(3); // first character
    expect(earned('x', 'a x')).toBe(3); // after a space
    expect(earned('x', 'a-x')).toBe(3); // after a hyphen
    expect(earned('x', 'a/x')).toBe(3); // after a slash
    expect(earned('x', 'a.x')).toBe(1); // a dot does not start a word
    expect(earned('ab', 'xayb')).toBe(2); // apart
    expect(earned('ab', 'xaby')).toBe(3); // together
    expect(earned('wo', 'Work')).toBe(5); // a word start, then together
  });

  it('word-start matches beat scattered ones', () => {
    // "wo" opens the word in Work; in Slow motion it lands inside two other words.
    expect(fuzzyScore('wo', 'Slow motion')).toBeGreaterThan(0);
    expect(fuzzyScore('wo', 'Work')).toBeGreaterThan(fuzzyScore('wo', 'Slow motion'));

    // Same length, same letters, no adjacent pair in either: only the word start differs.
    for (const separator of [' ', '-', '/']) {
      expect(fuzzyScore('ab', `a${separator}b`)).toBeGreaterThan(fuzzyScore('ab', 'axb'));
    }
  });

  it('consecutive runs beat gapped matches', () => {
    expect(fuzzyScore('ab', 'xaby')).toBeGreaterThan(fuzzyScore('ab', 'xayb'));
  });

  it('shorter texts win ties, but a tie-break never outweighs a real difference', () => {
    expect(earned('wo', 'Workshop')).toBe(earned('wo', 'Work'));
    expect(fuzzyScore('wo', 'Work')).toBeGreaterThan(fuzzyScore('wo', 'Workshop'));

    const veryLong = `Work ${'x'.repeat(200)}`;
    expect(fuzzyScore('wo', veryLong)).toBeGreaterThan(fuzzyScore('wo', 'Slow motion'));
  });

  it('finds the best place for each letter, not just the first', () => {
    // The first w sits inside Show; the better one opens Work.
    expect(earned('wo', 'Show Work')).toBe(earned('wo', 'Work'));
  });

  it('skips spaces typed in the query', () => {
    expect(fuzzyScore('ward os', 'WardOS')).toBe(fuzzyScore('wardos', 'WardOS'));
    expect(fuzzyScore('dock ward', 'Dock WardOS')).toBeGreaterThan(0);
  });

  it('matches an empty query to any text, shortest first', () => {
    expect(fuzzyScore('', 'Work')).toBeGreaterThan(0);
    expect(fuzzyScore('', 'Work')).toBeLessThan(1);
    expect(fuzzyScore('', 'Work')).toBeGreaterThan(fuzzyScore('', 'Workshop'));
  });
});

describe('rankCommands', () => {
  it('empty query returns every command grouped', () => {
    const grouped = [
      'dock-wardos', 'dock-homecast', // projects
      'go-work', 'go-about', // sections
      'open-linkedin', 'open-github', // links
      'toggle-sound', 'switch-theme', // actions
    ];
    expect(ids(rankCommands('', commands))).toEqual(grouped);
    expect(ids(rankCommands('  \t ', commands))).toEqual(grouped);
  });

  it('leaves the list it was given untouched', () => {
    // Its own list, out of group order, so nothing another test did can hide a change.
    const given: Command[] = [
      { id: 'a', label: 'Alpha', group: 'action' },
      { id: 'b', label: 'Beta', group: 'project' },
      { id: 'c', label: 'Gamma', group: 'link' },
    ];
    const before = [...given];

    const grouped = rankCommands('', given);
    rankCommands('a', given);

    expect(given).toEqual(before);
    expect(ids(grouped)).toEqual(['b', 'c', 'a']);
    expect(grouped).not.toBe(given);
  });

  it('"ward" ranks WardOS first', () => {
    // Rewards holds the same four letters mid-word: it matches, but ranks below.
    // It comes first in the input so the order cannot be an accident of position.
    const rival: Command = { id: 'go-rewards', label: 'Rewards', group: 'section' };
    expect(ids(rankCommands('ward', [rival, ...commands]))).toEqual(['dock-wardos', 'go-rewards']);
  });

  it('returns an empty list for no match', () => {
    expect(rankCommands('zzz', commands)).toEqual([]);
  });

  it('ranks by score first and by label second', () => {
    const list: Command[] = [
      { id: 'slow', label: 'Slow motion', group: 'action' },
      { id: 'work', label: 'Work', group: 'section' },
    ];
    // Alphabetical order would put Slow motion first; its weaker match keeps it behind.
    expect(ids(rankCommands('wo', list))).toEqual(['work', 'slow']);

    const tied: Command[] = [
      { id: 'cows', label: 'Cows', group: 'action' },
      { id: 'cats', label: 'Cats', group: 'action' },
    ];
    expect(ids(rankCommands('c', tied))).toEqual(['cats', 'cows']);
  });

  it('also matches on keywords, using the best of the label and the keywords', () => {
    expect(ids(rankCommands('audio', commands))).toEqual(['toggle-sound']);

    // Source has no g in its label, but its keyword matches better than Digital's label does.
    const list: Command[] = [
      { id: 'digital', label: 'Digital', group: 'section' },
      { id: 'source', label: 'Source', group: 'link', keywords: ['github'] },
    ];
    expect(ids(rankCommands('git', list))).toEqual(['source', 'digital']);
  });
});
