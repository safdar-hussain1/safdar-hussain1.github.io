import { describe, expect, test } from 'vitest';
import { parseWorkHash, workHash } from '../src/lib/hash';
import { isExternalTo, isSiteRoot } from '../src/lib/url';

const SITE = 'https://safdar-hussain1.github.io/';

describe('dock helpers', () => {
  test('parseWorkHash accepts #work/<slug> only', () => {
    expect(parseWorkHash('#work/wardos')).toBe('wardos');
    expect(parseWorkHash('#work/red-light-green-light-cv')).toBe('red-light-green-light-cv');
    expect(parseWorkHash('#work')).toBeNull();
    expect(parseWorkHash('#about')).toBeNull();
    expect(parseWorkHash('#work/../x')).toBeNull();
    expect(workHash('carmine')).toBe('#work/carmine');
  });

  test('isExternalTo treats github.com as external and the own origin as internal', () => {
    expect(isExternalTo('https://github.com/safdar-hussain1/wardos', SITE)).toBe(true);
    expect(isExternalTo('https://safdar-hussain1.github.io/wardos/#bills', SITE)).toBe(false);
    expect(isExternalTo('/wardos/', SITE)).toBe(false);
    expect(isExternalTo('mailto:x@y.z', SITE)).toBe(true);
  });

  test('isSiteRoot matches the root with and without a trailing slash', () => {
    expect(isSiteRoot('https://safdar-hussain1.github.io/', SITE)).toBe(true);
    expect(isSiteRoot('https://safdar-hussain1.github.io', SITE)).toBe(true);
    expect(isSiteRoot('/', SITE)).toBe(true);
    expect(isSiteRoot('https://safdar-hussain1.github.io/wardos/', SITE)).toBe(false);
    expect(isSiteRoot('https://github.com/', SITE)).toBe(false);
  });
});
