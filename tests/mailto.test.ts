import { describe, expect, test } from 'vitest';
import { mailtoFor } from '../src/lib/mailto';

describe('the contact form\'s mail link', () => {
  test('addresses the site, names the sender in the subject and carries the message', () => {
    const href = mailtoFor('me@example.com', { name: 'Asha Rao', email: 'asha@example.com', message: 'Hello there.\nTwo lines.' });
    const url = new URL(href);
    expect(url.protocol).toBe('mailto:');
    expect(url.pathname).toBe('me@example.com');
    expect(url.searchParams.get('subject')).toBe('Hello from Asha Rao');
    expect(url.searchParams.get('body')).toBe('Hello there.\nTwo lines.\n\n— Asha Rao\nasha@example.com');
  });

  test('copes with empty fields', () => {
    const url = new URL(mailtoFor('me@example.com', { name: '  ', email: '', message: 'Hi' }));
    expect(url.searchParams.get('subject')).toBe('Hello from your portfolio');
    expect(url.searchParams.get('body')).toBe('Hi');
  });
});
