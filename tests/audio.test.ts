// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CUES, cueSpec, envelopeFor, type Cue } from '../src/lib/audio';
import { bindSoundSwitch, createSound } from '../src/scripts/sound';

// ---------------------------------------------------------------------------
// Storage doubles
// ---------------------------------------------------------------------------

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

const blockedStorage = {
  getItem: () => {
    throw new Error('storage is blocked');
  },
  setItem: () => {
    throw new Error('storage is blocked');
  },
};

// ---------------------------------------------------------------------------
// A Web Audio double that records what was scheduled
// ---------------------------------------------------------------------------

type ParamEvent = { kind: 'set' | 'ramp' | 'cancel'; value?: number; time: number };

class FakeParam {
  value = 0;
  events: ParamEvent[] = [];
  setValueAtTime(value: number, time: number) {
    this.events.push({ kind: 'set', value, time });
    return this;
  }
  linearRampToValueAtTime(value: number, time: number) {
    this.events.push({ kind: 'ramp', value, time });
    return this;
  }
  cancelScheduledValues(time: number) {
    this.events.push({ kind: 'cancel', time });
    return this;
  }
}

class FakeOscillator {
  type = 'sine';
  frequency = new FakeParam();
  starts: number[] = [];
  stops: number[] = [];
  output: unknown = null;
  onended: (() => void) | null = null;
  connect(node: unknown) {
    this.output = node;
    return node;
  }
  disconnect() {}
  start(when: number) {
    this.starts.push(when);
  }
  stop(when: number) {
    this.stops.push(when);
  }
}

class FakeGain {
  gain = new FakeParam();
  output: unknown = null;
  connect(node: unknown) {
    this.output = node;
    return node;
  }
  disconnect() {}
}

class FakeAudioContext {
  static made: FakeAudioContext[] = [];
  static startsAs: 'running' | 'suspended' = 'running';
  static blocked = false; // true: resume() never gets the context running

  currentTime = 10;
  state: 'running' | 'suspended' = FakeAudioContext.startsAs;
  destination = {};
  oscillators: FakeOscillator[] = [];
  gains: FakeGain[] = [];
  resumes = 0;

  constructor() {
    FakeAudioContext.made.push(this);
  }
  createOscillator() {
    const node = new FakeOscillator();
    this.oscillators.push(node);
    return node;
  }
  createGain() {
    const node = new FakeGain();
    this.gains.push(node);
    return node;
  }
  resume() {
    this.resumes += 1;
    if (!FakeAudioContext.blocked) this.state = 'running';
    return Promise.resolve();
  }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

function soundWith(store: Parameters<typeof createSound>[0] = memoryStorage()) {
  return createSound(store);
}

/** A sound whose remembered choice is already "on". */
function soundThatIsOn() {
  return soundWith(memoryStorage({ 'portfolio.sound': 'on' }));
}

beforeEach(() => {
  FakeAudioContext.made = [];
  FakeAudioContext.startsAs = 'running';
  FakeAudioContext.blocked = false;
  vi.stubGlobal('AudioContext', FakeAudioContext);
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// cueSpec
// ---------------------------------------------------------------------------

describe('cueSpec', () => {
  const total = (cue: Cue) => cueSpec(cue).reduce((sum, segment) => sum + segment.seconds, 0);

  it('every cue has a spec under one second except the hum', () => {
    for (const cue of CUES) {
      if (cue === 'hum-start') expect(total(cue)).toBe(Infinity);
      else expect(total(cue), cue).toBeLessThan(1);
    }
  });

  it('keeps every cue quiet', () => {
    for (const cue of CUES) {
      for (const segment of cueSpec(cue)) {
        expect(segment.gain, cue).toBeGreaterThan(0);
        expect(segment.gain, cue).toBeLessThanOrEqual(0.1);
      }
    }
  });

  it('makes the dock cue two short sines a fifth apart, and undock the same pair reversed', () => {
    const dock = cueSpec('dock');
    expect(dock).toEqual([
      { type: 'sine', freq: 440, seconds: 0.09, gain: 0.08 },
      { type: 'sine', freq: 660, seconds: 0.09, gain: 0.08 },
    ]);
    expect(dock[1].freq / dock[0].freq).toBeCloseTo(3 / 2);
    expect(cueSpec('undock')).toEqual([...dock].reverse());
  });

  it('makes the tick one 12 ms triangle', () => {
    expect(cueSpec('tick')).toEqual([{ type: 'triangle', freq: 1800, seconds: 0.012, gain: 0.05 }]);
  });

  it('makes the focus cue one soft sine', () => {
    expect(cueSpec('focus')).toEqual([{ type: 'sine', freq: 523, seconds: 0.18, gain: 0.06 }]);
  });

  it('makes the hum a 55 Hz sine held until it is stopped, and stopping it silent', () => {
    expect(cueSpec('hum-start')).toEqual([{ type: 'sine', freq: 55, seconds: Infinity, gain: 0.04 }]);
    expect(cueSpec('hum-stop')).toEqual([]);
  });

  it('hands out a fresh copy every time', () => {
    const first = cueSpec('dock');
    first[0].freq = 1;
    first.pop();
    expect(cueSpec('dock')).toHaveLength(2);
    expect(cueSpec('dock')[0].freq).toBe(440);
  });
});

// ---------------------------------------------------------------------------
// envelopeFor
// ---------------------------------------------------------------------------

describe('envelopeFor', () => {
  it('fades in over 5 ms and out over 20 ms when there is room', () => {
    const dock = envelopeFor(0.09);
    expect(dock.attack).toBeCloseTo(0.005, 9);
    expect(dock.hold).toBeCloseTo(0.065, 9);
    expect(dock.release).toBeCloseTo(0.02, 9);

    const held = envelopeFor(Infinity);
    expect(held.attack).toBe(0.005);
    expect(held.release).toBe(0.02);
  });

  it('shrinks the fades so both fit inside a very short sound', () => {
    const tick = envelopeFor(0.012);
    expect(tick.attack).toBeCloseTo(0.005, 9);
    expect(tick.release).toBeCloseTo(0.007, 9);
    expect(tick.hold).toBeCloseTo(0, 9);

    const sliver = envelopeFor(0.004);
    expect(sliver.attack).toBeCloseTo(0.002, 9);
    expect(sliver.release).toBeCloseTo(0.002, 9);
  });

  it('never has a negative part, and the parts add up to the length', () => {
    const lengths = [
      ...CUES.flatMap((cue) => cueSpec(cue).map((segment) => segment.seconds)),
      // either side of where the fades stop fitting, and some awkward fractions
      0.0001, 0.001, 0.004, 0.0099, 0.01, 0.0101, 0.011, 0.025, 0.0251, 0.026, 0.3, 0.7, 1, 2.5,
    ].filter(Number.isFinite);

    for (const seconds of lengths) {
      const { attack, hold, release } = envelopeFor(seconds);
      expect(attack, String(seconds)).toBeGreaterThanOrEqual(0);
      expect(hold, String(seconds)).toBeGreaterThanOrEqual(0);
      expect(release, String(seconds)).toBeGreaterThanOrEqual(0);
      expect(attack + hold + release, String(seconds)).toBeCloseTo(seconds, 9);
    }
  });

  it('gives a sound with no length nothing to shape', () => {
    expect(envelopeFor(0)).toEqual({ attack: 0, hold: 0, release: 0 });
  });
});

// ---------------------------------------------------------------------------
// createSound: the switch and its memory
// ---------------------------------------------------------------------------

describe('createSound state', () => {
  it('sound starts disabled', () => {
    expect(soundWith().enabled()).toBe(false);
  });

  it('starts disabled when storage cannot be read', () => {
    expect(soundWith(blockedStorage).enabled()).toBe(false);
    expect(soundWith(null).enabled()).toBe(false);
  });

  it('finds the browser storage by itself, and copes with it missing or refusing access', () => {
    localStorage.setItem('portfolio.sound', 'on');
    expect(createSound().enabled()).toBe(true);

    vi.stubGlobal('localStorage', undefined); // an environment with no storage at all
    expect(createSound().enabled()).toBe(false);

    // Some browsers throw from the property itself when site data is blocked.
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('site data is blocked');
      },
    });
    const sound = createSound();
    expect(sound.enabled()).toBe(false);
    expect(sound.toggle()).toBe(true);
  });

  it('starts enabled only when the remembered choice is "on"', () => {
    expect(soundWith(memoryStorage({ 'portfolio.sound': 'on' })).enabled()).toBe(true);
    expect(soundWith(memoryStorage({ 'portfolio.sound': 'off' })).enabled()).toBe(false);
    expect(soundWith(memoryStorage({ 'portfolio.sound': 'yes' })).enabled()).toBe(false);
  });

  it('toggle persists when storage works and still flips when it throws', () => {
    const storage = memoryStorage();
    const sound = soundWith(storage);

    expect(sound.toggle()).toBe(true);
    expect(sound.enabled()).toBe(true);
    expect(storage.data.get('portfolio.sound')).toBe('on');
    expect(createSound(storage).enabled()).toBe(true); // a later page load sees the choice

    expect(sound.toggle()).toBe(false);
    expect(storage.data.get('portfolio.sound')).toBe('off');
    expect(createSound(storage).enabled()).toBe(false);

    const unsaved = soundWith(blockedStorage);
    expect(unsaved.toggle()).toBe(true);
    expect(unsaved.enabled()).toBe(true);
    expect(unsaved.toggle()).toBe(false);
    expect(unsaved.enabled()).toBe(false);
  });

  it('remembers the choice in the real localStorage under portfolio.sound', () => {
    const sound = createSound();
    sound.toggle();
    expect(localStorage.getItem('portfolio.sound')).toBe('on');
    sound.toggle();
    expect(localStorage.getItem('portfolio.sound')).toBe('off');
  });
});

// ---------------------------------------------------------------------------
// createSound: playing
// ---------------------------------------------------------------------------

describe('createSound playback', () => {
  it('does nothing while sound is off', () => {
    const sound = soundWith();
    sound.play('dock');
    sound.play('tick');
    sound.play('hum-start');
    expect(FakeAudioContext.made).toHaveLength(0);
  });

  it('stays silent until the visitor has interacted, even when sound is remembered as on', () => {
    vi.stubGlobal('navigator', { userActivation: { hasBeenActive: false } });
    const sound = soundThatIsOn();

    sound.play('dock');
    sound.play('hum-start');
    expect(FakeAudioContext.made).toHaveLength(0); // no context either, so no autoplay warning

    vi.stubGlobal('navigator', { userActivation: { hasBeenActive: true } });
    sound.play('dock');
    expect(FakeAudioContext.made).toHaveLength(1);
    expect(FakeAudioContext.made[0].oscillators).toHaveLength(2);
  });

  it('plays where the browser cannot say whether the visitor has interacted', () => {
    vi.stubGlobal('navigator', {});
    soundThatIsOn().play('tick');
    expect(FakeAudioContext.made[0].oscillators).toHaveLength(1);
  });

  it('opens the audio context lazily and only once', () => {
    const sound = soundThatIsOn();
    expect(FakeAudioContext.made).toHaveLength(0); // a page load alone opens nothing

    sound.play('tick');
    sound.play('focus');
    expect(FakeAudioContext.made).toHaveLength(1);
  });

  it('turning sound on opens and starts the context inside that click', () => {
    FakeAudioContext.startsAs = 'suspended';
    const sound = soundWith();

    expect(sound.toggle()).toBe(true);
    expect(FakeAudioContext.made).toHaveLength(1);
    expect(FakeAudioContext.made[0].resumes).toBe(1);
    expect(FakeAudioContext.made[0].state).toBe('running');

    sound.play('tick');
    expect(FakeAudioContext.made).toHaveLength(1); // the same context is reused
  });

  it('plays a cue one tone after another, each through its own gain to the output', () => {
    const sound = soundThatIsOn();
    sound.play('dock');
    const [ctx] = FakeAudioContext.made;

    expect(ctx.oscillators.map((osc) => [osc.type, osc.frequency.value])).toEqual([
      ['sine', 440],
      ['sine', 660],
    ]);
    expect(ctx.oscillators[0].starts[0]).toBeCloseTo(10, 6);
    expect(ctx.oscillators[0].stops[0]).toBeCloseTo(10.09, 6);
    expect(ctx.oscillators[1].starts[0]).toBeCloseTo(10.09, 6);
    expect(ctx.oscillators[1].stops[0]).toBeCloseTo(10.18, 6);

    ctx.oscillators.forEach((osc, i) => {
      expect(osc.output).toBe(ctx.gains[i]);
      expect(ctx.gains[i].output).toBe(ctx.destination);
    });
  });

  it('fades each tone in over 5 ms and out over its last 20 ms', () => {
    const sound = soundThatIsOn();
    sound.play('dock');
    const events = FakeAudioContext.made[0].gains[0].gain.events;

    expect(events.map((event) => [event.kind, event.value])).toEqual([
      ['set', 0],
      ['ramp', 0.08],
      ['set', 0.08],
      ['ramp', 0],
    ]);
    expect(events[0].time).toBeCloseTo(10, 6);
    expect(events[1].time).toBeCloseTo(10.005, 6);
    expect(events[2].time).toBeCloseTo(10.07, 6);
    expect(events[3].time).toBeCloseTo(10.09, 6);
  });

  it('plays the 12 ms tick as a short rise and fall that fits inside it', () => {
    const sound = soundThatIsOn();
    sound.play('tick');
    const [ctx] = FakeAudioContext.made;
    const events = ctx.gains[0].gain.events;

    expect(ctx.oscillators[0].type).toBe('triangle');
    expect(ctx.oscillators[0].frequency.value).toBe(1800);
    expect(events[1].time).toBeCloseTo(10.005, 6);
    expect(events[3].time).toBeCloseTo(10.012, 6);
    expect(ctx.oscillators[0].stops[0]).toBeCloseTo(10.012, 6);
  });

  it('never schedules a gain change out of order or in the past', () => {
    for (const cue of CUES) {
      FakeAudioContext.made = [];
      soundThatIsOn().play(cue);
      for (const gain of FakeAudioContext.made[0]?.gains ?? []) {
        const times = gain.gain.events.map((event) => event.time);
        expect(times, cue).toEqual([...times].sort((a, b) => a - b));
        expect(times[0], cue).toBeGreaterThanOrEqual(10);
      }
    }
  });

  it('plays nothing for hum-stop when no hum is running', () => {
    const sound = soundThatIsOn();
    sound.play('hum-stop');
    expect(FakeAudioContext.made.flatMap((ctx) => ctx.oscillators)).toHaveLength(0);
  });

  it('holds the hum until hum-stop releases it', () => {
    const sound = soundThatIsOn();
    sound.play('hum-start');
    const [ctx] = FakeAudioContext.made;
    const hum = ctx.oscillators[0];

    expect(hum.type).toBe('sine');
    expect(hum.frequency.value).toBe(55);
    expect(hum.starts).toHaveLength(1);
    expect(hum.stops).toHaveLength(0); // held

    sound.play('hum-start'); // already humming
    expect(ctx.oscillators).toHaveLength(1);

    ctx.currentTime = 12;
    sound.play('hum-stop');
    expect(hum.stops).toHaveLength(1);
    expect(hum.stops[0]).toBeCloseTo(12.02, 6);
    const last = ctx.gains[0].gain.events.at(-1);
    expect(last?.kind).toBe('ramp');
    expect(last?.value).toBe(0);
    expect(last?.time).toBeCloseTo(12.02, 6);

    sound.play('hum-stop'); // nothing left to stop
    expect(hum.stops).toHaveLength(1);

    sound.play('hum-start'); // and it can start again
    expect(ctx.oscillators).toHaveLength(2);
  });

  it('turning sound off silences a running hum and keeps later cues quiet', () => {
    const sound = soundThatIsOn();
    sound.play('hum-start');
    const [ctx] = FakeAudioContext.made;

    expect(sound.toggle()).toBe(false);
    expect(ctx.oscillators[0].stops).toHaveLength(1);

    sound.play('hum-start');
    sound.play('dock');
    expect(ctx.oscillators).toHaveLength(1);
  });

  it('drops cues rather than queueing them while the context is not allowed to run', () => {
    FakeAudioContext.startsAs = 'suspended';
    FakeAudioContext.blocked = true;
    const sound = soundThatIsOn();

    sound.play('tick'); // the cue that opens the context is scheduled
    const [ctx] = FakeAudioContext.made;
    expect(ctx.oscillators).toHaveLength(1);

    sound.play('tick');
    sound.play('tick');
    expect(ctx.oscillators).toHaveLength(1); // later ones are dropped, not stacked up
    expect(ctx.resumes).toBe(3); // each cue asks the browser again

    ctx.state = 'running';
    sound.play('tick');
    expect(ctx.oscillators).toHaveLength(2);
  });

  it('is a quiet no-op when the browser has no Web Audio', () => {
    vi.stubGlobal('AudioContext', undefined);
    const sound = soundThatIsOn();

    expect(() => {
      sound.play('dock');
      sound.play('hum-start');
      sound.play('hum-stop');
    }).not.toThrow();
    expect(sound.toggle()).toBe(false); // the switch still works
  });

  it('never lets a refusal from Web Audio reach the caller', () => {
    class RefusingContext extends FakeAudioContext {
      createOscillator(): FakeOscillator {
        throw new Error('refused');
      }
    }
    vi.stubGlobal('AudioContext', RefusingContext);
    expect(() => soundThatIsOn().play('dock')).not.toThrow();

    class BrokenContext {
      constructor() {
        throw new Error('too many audio contexts');
      }
    }
    vi.stubGlobal('AudioContext', BrokenContext);
    const sound = soundThatIsOn();
    expect(() => sound.play('dock')).not.toThrow();
    expect(() => sound.toggle()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// bindSoundSwitch
// ---------------------------------------------------------------------------

describe('bindSoundSwitch', () => {
  it('shows the state in aria-pressed and flips it on click', () => {
    const sound = soundWith();
    const button = document.createElement('button');
    bindSoundSwitch(button, sound);

    expect(button.getAttribute('aria-pressed')).toBe('false');
    button.click();
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(sound.enabled()).toBe(true);
    button.click();
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(sound.enabled()).toBe(false);
  });

  it('starts pressed when sound was left on', () => {
    const button = document.createElement('button');
    bindSoundSwitch(button, soundThatIsOn());
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });

  it('hands back a refresh for changes made somewhere else', () => {
    const sound = soundWith();
    const button = document.createElement('button');
    const refresh = bindSoundSwitch(button, sound);

    sound.toggle(); // for example from the command palette
    expect(button.getAttribute('aria-pressed')).toBe('false');
    refresh();
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });
});
