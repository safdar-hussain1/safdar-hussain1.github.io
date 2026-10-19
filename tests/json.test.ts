import { describe, expect, test } from 'vitest';
import { jsonForHtml } from '../src/lib/json';
import { framePath } from '../src/lib/url';

describe('data embedded in the page', () => {
  test('jsonForHtml cannot close a script block or open a tag', () => {
    const out = jsonForHtml({ a: '</script><img src=x onerror=1>', b: '& ' });
    expect(out).not.toMatch(/[<>&  ]/);
    expect(JSON.parse(out)).toEqual({ a: '</script><img src=x onerror=1>', b: '& ' });
  });

  test('framePath never yields a protocol-relative path and compares origins', () => {
    expect(framePath('https://safdar-hussain1.github.io//evil.example/', 'https://safdar-hussain1.github.io/')).toBe('/evil.example/');
    expect(framePath('http://safdar-hussain1.github.io/wardos/', 'https://safdar-hussain1.github.io/')).toBe('http://safdar-hussain1.github.io/wardos/');
  });
});
