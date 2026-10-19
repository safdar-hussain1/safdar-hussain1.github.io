import { createSound, bindSoundSwitch } from './sound';

// Page-wide wiring that every page shares: the sound switch, and the sounds the dock makes.
const sound = createSound();
const sw = document.getElementById('sound-switch');
const refresh = sw ? bindSoundSwitch(sw, sound) : () => {};
// One shared instance for the whole page; the palette toggles through this so the switch stays in step.
(window as unknown as { __sound?: unknown }).__sound = {
  enabled: () => sound.enabled(),
  toggle: () => {
    const on = sound.toggle();
    refresh();
    return on;
  },
  play: (cue: Parameters<typeof sound.play>[0]) => sound.play(cue),
};

const dock = document.getElementById('dock');
dock?.addEventListener('dock:open', () => sound.play('dock'));
dock?.addEventListener('dock:close', () => sound.play('undock'));

// The 3D stage is not part of this build; the selftest reads why it is off.
const w = window as unknown as { __stage?: { started: boolean; reason?: string } };
w.__stage ??= { started: false, reason: 'off' };
