/**
 * The sound design as plain data and arithmetic, with no Web Audio calls, so it
 * can be tested and tuned without a browser. src/scripts/sound.ts plays it.
 */

export const CUES = ['focus', 'dock', 'undock', 'tick', 'hum-start', 'hum-stop'] as const;
export type Cue = (typeof CUES)[number];

/** One tone. A cue is a list of these, played one after another. */
export type Segment = {
  type: 'sine' | 'triangle';
  /** Hertz. */
  freq: number;
  /** How long the tone lasts. Infinity means it is held until the cue that stops it. */
  seconds: number;
  /** Peak level from 0 to 1. Kept low so sound stays an accent and never competes with the page. */
  gain: number;
};

// Dock and undock use the same two sines a perfect fifth (3:2) apart: rising as a
// project opens, falling as it closes.
const DOCK: readonly Segment[] = [
  { type: 'sine', freq: 440, seconds: 0.09, gain: 0.08 },
  { type: 'sine', freq: 660, seconds: 0.09, gain: 0.08 },
];

const SPECS: Record<Cue, readonly Segment[]> = {
  // A soft sine for a stop coming into focus.
  focus: [{ type: 'sine', freq: 523, seconds: 0.18, gain: 0.06 }],
  dock: DOCK,
  undock: [...DOCK].reverse(),
  // 12 ms of bright triangle: a click-sized tick that can repeat while scrolling without
  // ever turning into a note.
  tick: [{ type: 'triangle', freq: 1800, seconds: 0.012, gain: 0.05 }],
  // A low sine held for as long as it is wanted. 'hum-stop' has nothing to play: it ends the hum.
  'hum-start': [{ type: 'sine', freq: 55, seconds: Infinity, gain: 0.04 }],
  'hum-stop': [],
};

/**
 * What a cue sounds like, as tones to play one after another. Each call returns
 * a fresh copy, so a caller may change it without affecting the next one.
 */
export function cueSpec(cue: Cue): Segment[] {
  return (SPECS[cue] ?? []).map((segment) => ({ ...segment }));
}

export const ATTACK_SECONDS = 0.005; // a fade in this long keeps a tone from starting with a click
export const RELEASE_SECONDS = 0.02; // and a fade out this long keeps it from ending with one

export type Envelope = { attack: number; hold: number; release: number };

/**
 * How a tone of this length is shaped: fade in, hold at full level, fade out.
 * The fades are 5 ms and 20 ms, shortened to fit a very short tone (the 12 ms
 * tick gets 5 ms in, 7 ms out and no hold). For a finite tone the three parts
 * add up to `seconds`; a held tone (Infinity) gets the full fades and an
 * endless hold. A tone with no length has nothing to shape.
 */
export function envelopeFor(seconds: number): Envelope {
  if (!(seconds > 0)) return { attack: 0, hold: 0, release: 0 };
  const attack = Math.min(ATTACK_SECONDS, seconds / 2);
  const release = Math.min(RELEASE_SECONDS, seconds - attack);
  return { attack, hold: seconds - attack - release, release };
}
