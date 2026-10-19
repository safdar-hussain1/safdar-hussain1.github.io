/**
 * Sound, off by default. Nothing is opened or played until the visitor turns it
 * on, and the choice is remembered per browser under `portfolio.sound`.
 */
import { RELEASE_SECONDS, cueSpec, envelopeFor, type Cue, type Segment } from '../lib/audio';

export const SOUND_KEY = 'portfolio.sound';

type Store = Pick<Storage, 'getItem' | 'setItem'>;

export type Sound = {
  /** Whether cues currently sound. */
  enabled(): boolean;
  /** Flips the switch, remembers the choice and returns the new state. */
  toggle(): boolean;
  /** Plays a cue. Silent while sound is off, and never throws. */
  play(cue: Cue): void;
};

/** A tone that is sounding, kept so that a held one can be released. */
type Voice = { osc: OscillatorNode; amp: GainNode };

const ignore = () => {};

function storage(): Store | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null; // with site data blocked, even reading the property throws
  }
}

function readChoice(store: Store | null): boolean {
  try {
    return store?.getItem(SOUND_KEY) === 'on';
  } catch {
    return false; // storage blocked or missing: start silent
  }
}

function writeChoice(store: Store | null, on: boolean): void {
  try {
    store?.setItem(SOUND_KEY, on ? 'on' : 'off');
  } catch {
    // Private windows can refuse writes; the choice then lasts for this visit only.
  }
}

/**
 * Browsers refuse to start audio before the visitor has clicked, tapped or pressed a key,
 * and some log a warning for trying. Where the browser cannot say, assume they have.
 */
function hasInteracted(): boolean {
  return typeof navigator === 'undefined' || navigator.userActivation?.hasBeenActive !== false;
}

function openContext(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  try {
    return new AudioContext();
  } catch {
    return null; // for example the browser's limit on audio contexts
  }
}

/** Runs Web Audio work so that whatever the browser refuses never reaches the click that asked for it. */
function attempt(work: () => void): void {
  try {
    work();
  } catch {
    // Sound is an extra: losing a cue is better than an error inside a click handler.
  }
}

/** Starts one tone at `at` seconds on the context clock, shaped so it neither begins nor ends with a click. */
function sing(ctx: AudioContext, segment: Segment, at: number): Voice {
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = segment.type;
  osc.frequency.value = segment.freq;

  // Every time below is the one before plus a part that is zero or more, so the
  // gain events always reach the scheduler in time order.
  const { attack, hold, release } = envelopeFor(segment.seconds);
  const peak = at + attack;
  amp.gain.setValueAtTime(0, at);
  amp.gain.linearRampToValueAtTime(segment.gain, peak);

  osc.connect(amp);
  amp.connect(ctx.destination);
  osc.onended = () => {
    osc.disconnect();
    amp.disconnect();
  };
  osc.start(at);

  // A held tone (the hum) gets no ending here; releaseHum() gives it one.
  if (Number.isFinite(segment.seconds)) {
    const fade = peak + hold;
    const end = fade + release;
    amp.gain.setValueAtTime(segment.gain, fade);
    amp.gain.linearRampToValueAtTime(0, end);
    osc.stop(end);
  }
  return { osc, amp };
}

export function createSound(store: Store | null = storage()): Sound {
  let on = readChoice(store);
  let context: AudioContext | null = null;
  let hum: Voice | null = null;

  /**
   * The one shared context, opened on first use and asked to run if it is not.
   * `fresh` says this call opened it; `running` is its state before the request to run.
   */
  function acquire() {
    const fresh = context === null;
    context ??= openContext();
    if (!context) return null;
    const running = context.state === 'running';
    if (!running) context.resume().catch(ignore);
    return { ctx: context, fresh, running };
  }

  function releaseHum(): void {
    if (!hum || !context) return;
    const { osc, amp } = hum;
    hum = null;
    const now = context.currentTime;
    amp.gain.cancelScheduledValues(now);
    amp.gain.setValueAtTime(amp.gain.value, now);
    amp.gain.linearRampToValueAtTime(0, now + RELEASE_SECONDS);
    osc.stop(now + RELEASE_SECONDS);
  }

  function toggle(): boolean {
    on = !on;
    writeChoice(store, on);
    attempt(() => {
      if (on) {
        // Turning sound on is a click, which browsers accept as permission to start audio.
        // Opening the context here lets cues made later outside a click (scrolling) sound too.
        acquire();
      } else {
        // A hum that is still running must not outlive the switch.
        releaseHum();
      }
    });
    return on;
  }

  function play(cue: Cue): void {
    // A remembered "on" must not make a sound by itself: nothing plays until the visitor does something.
    if (!on || !hasInteracted()) return;
    attempt(() => {
      if (cue === 'hum-stop') {
        releaseHum();
        return;
      }

      const got = acquire();
      if (!got) return;
      // A context the browser has not let start would hold every cue given to it and
      // sound them all at once when it finally does. Only the cue that opens it is kept.
      if (!got.running && !got.fresh) return;

      const { ctx } = got;
      if (cue === 'hum-start') {
        hum ??= sing(ctx, cueSpec(cue)[0], ctx.currentTime);
        return;
      }

      let at = ctx.currentTime;
      for (const segment of cueSpec(cue)) {
        sing(ctx, segment, at);
        at += segment.seconds;
      }
    });
  }

  return { enabled: () => on, toggle, play };
}

/**
 * Keeps a button's `aria-pressed` in step with the sound state and makes a click
 * toggle it. Returns a function that re-reads the state, for when something
 * other than the button (the command palette) changes it.
 */
export function bindSoundSwitch(button: HTMLElement, sound: Pick<Sound, 'enabled' | 'toggle'>): () => void {
  const refresh = () => button.setAttribute('aria-pressed', String(sound.enabled()));
  refresh();
  button.addEventListener('click', () => {
    sound.toggle();
    refresh();
  });
  return refresh;
}
