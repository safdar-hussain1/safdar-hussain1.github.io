import { describe, expect, test } from 'vitest';
import { relativeTime, shortIsoDate } from '../src/lib/format';

describe('format', () => {
  test('shortIsoDate', () => {
    expect(shortIsoDate('2026-10-19T13:08:13Z')).toBe('19 Oct 2026');
    expect(shortIsoDate('nonsense')).toBe('nonsense');
  });

  test('relativeTime in plain words', () => {
    const now = new Date('2026-10-20T12:00:00Z');
    expect(relativeTime('2026-10-20T01:00:00Z', now)).toBe('today');
    expect(relativeTime('2026-10-19T11:00:00Z', now)).toBe('yesterday');
    expect(relativeTime('2026-10-15T12:00:00Z', now)).toBe('5 days ago');
    expect(relativeTime('2026-09-25T12:00:00Z', now)).toBe('3 weeks ago');
    expect(relativeTime('2026-06-01T12:00:00Z', now)).toBe('4 months ago');
    expect(relativeTime('2024-06-01T12:00:00Z', now)).toBe('2 years ago');
  });
});
