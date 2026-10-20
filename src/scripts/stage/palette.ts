// The scene's colours per theme: a night city on the dark theme, dusk on the light one.
export interface CityPalette {
  ground: string;
  /** The zenith of the sky; the horizon is the fog colour. */
  sky: string;
  fogColor: string;
  ink: string;
  plinth: string;
  top: string;
  road: string;
  kerb: string;
  bldg: string;
  tree: string;
  lampIntensity: number;
  windowIntensity: number;
  moonIntensity: number;
  moonColor: string;
  hemiIntensity: number;
  hemiSky: string;
  hemiGround: string;
  fog: [number, number];
  lensEnv: number;
  bloom: number;
  /** Scales every additive glow: 1 at night, a fraction by day, where glow reads as haze. */
  glow: number;
  /** Scales the accent spot on the stop in focus, for the same reason. */
  accent: number;
}

export const PALETTES: Record<'dark' | 'light', CityPalette> = {
  dark: {
    ground: '#0b1020',
    sky: '#05080f',
    fogColor: '#141d3a',
    ink: '#eef2ff',
    plinth: '#0d1427',
    top: '#121b33',
    road: '#1a2238',
    kerb: '#0e1528',
    bldg: '#19213a',
    tree: '#12302b',
    lampIntensity: 1.6,
    windowIntensity: 1.0,
    moonIntensity: 1.7,
    moonColor: '#a9bcff',
    hemiIntensity: 0.9,
    hemiSky: '#6678b8',
    hemiGround: '#141a30',
    fog: [9, 32],
    lensEnv: 0.9,
    bloom: 0,
    glow: 1,
    accent: 1,
  },
  light: {
    ground: '#edeff4',
    sky: '#b7c4e4',
    fogColor: '#e2e4ec',
    ink: '#101523',
    plinth: '#c6ccd8',
    top: '#dadfe8',
    road: '#a2a9ba',
    kerb: '#b4bccb',
    bldg: '#ece6df',
    tree: '#5e8f78',
    lampIntensity: 0.5,
    windowIntensity: 0.4,
    moonIntensity: 2.6,
    moonColor: '#ffd9a8',
    hemiIntensity: 1.6,
    hemiSky: '#dfe7ff',
    hemiGround: '#9aa3b8',
    fog: [12, 42],
    lensEnv: 0.6,
    bloom: 0,
    glow: 0.12,
    accent: 0.3,
  },
};

export function paletteFor(theme: 'dark' | 'light'): CityPalette {
  return PALETTES[theme];
}
