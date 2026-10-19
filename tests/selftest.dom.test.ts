// @vitest-environment happy-dom
import { describe, expect, test } from 'vitest';
import { reportSelftest, runSelftest } from '../src/scripts/selftest';

describe('selftest', () => {
  test('reports a failure by name and the count in the title', () => {
    document.body.innerHTML = '<footer>Built by Safdar Hussain.</footer>';
    const result = { pass: false, n: 9, failures: ['every poster loads', 'the dock is present'] };
    reportSelftest(result, document);
    expect(document.title).toBe('PORTFOLIO SELFTEST FAIL every poster loads (2 of 9)');
    expect(document.getElementById('selftest-result')?.textContent).toContain('the dock is present');
  });

  test('a page with nothing in it fails the structural checks but still counts them', async () => {
    document.body.innerHTML = '<h1>x</h1><footer>Built by Safdar Hussain.</footer>';
    const r = await runSelftest({ document, dock: null, palette: null, stage: { started: false, reason: 'off' } });
    expect(r.pass).toBe(false);
    expect(r.n).toBe(9);
    expect(r.failures).toContain('every poster loads');
    expect(r.failures).not.toContain('exactly one h1');
    expect(r.failures).not.toContain('the stage started or says why not');
  });
});
