// How each live page is driven while it is filmed and photographed.
//
// A routine waits for something the page itself shows (a button that becomes usable, a label that
// stops changing), calls begin(page) to mark the first moment of the loop, does its timed actions
// measured from that mark, and returns with the page in the state worth a poster. Anchoring the
// timing to a signal and not to the clock means a slow network shifts the whole loop and leaves
// the choreography alone. Every page runs on its own built-in demo, and no routine goes near the
// camera: nothing here clicks a camera button, and no permission is ever granted.

// The pages boot a database, a model or a WebGL scene, so the waits are generous.
const PATIENCE = 60_000;

const loopStarts = new WeakMap();

/** When (epoch milliseconds) the routine marked the first moment of the loop on this page. */
export const loopStartedAt = (page) => loopStarts.get(page);

const begin = (page) => loopStarts.set(page, Date.now());

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

/** Wait until `seconds` after the loop began, then run `action`. */
async function atSecond(page, seconds, action = async () => {}) {
  await sleep(loopStarts.get(page) + seconds * 1000 - Date.now());
  await action();
}

/** Poll until `check` returns something truthy, and say what was missing if it never does. */
async function until(check, what, timeout = PATIENCE) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await sleep(100);
  }
}

/**
 * Wait until `read()` has returned the same value for `quiet` milliseconds and `ready` accepts it.
 * `ready` keeps a page that is still but unfinished (a counter parked at its starting figure)
 * from passing for one that has settled.
 */
async function settled(read, what, { quiet = 800, ready = () => true } = {}) {
  let last;
  let since = Date.now();
  await until(async () => {
    const value = await read();
    if (value !== last) {
      last = value;
      since = Date.now();
    }
    return ready(value) && Date.now() - since >= quiet;
  }, what);
  return last;
}

/** Click, then take the pointer off the content so no hover style is left on what was clicked. */
async function click(page, locator) {
  await locator.click({ timeout: 10_000 });
  await page.mouse.move(1, 1);
}

export const CHOREO = {
  // A 32-bed hospital on a SQLite database in the tab. The replay runs the six months of the
  // event log through the plan, which is the loop; the page is back at today when it ends.
  async wardos(page) {
    const replay = page.getByRole('button', { name: 'Replay six months' });
    await until(() => replay.isEnabled().catch(() => false), 'the replay button to be usable');
    // The beds fill in a second after the database opens. A count of zero is the page still
    // empty, so only a count above zero that has stopped moving is the plan at rest.
    const beds = page.getByText(/of \d+ beds in use/).first();
    await settled(() => beds.innerText().catch(() => ''), 'the bed count to stop moving', {
      ready: (text) => /^[1-9]/.test(text),
    });
    begin(page);
    await click(page, replay);
    // The replay takes about twelve seconds and shows a banner for as long as it runs.
    const banner = page.getByText('Replaying the event log');
    await banner.waitFor({ state: 'visible', timeout: 5_000 });
    await banner.waitFor({ state: 'hidden', timeout: 30_000 });
  },

  // Six disease-risk models. The hero is one canvas with a light for every real patient: the
  // lights fly in to their places, then the Diabetes chip swaps in a different set of patients.
  async nightingale(page) {
    // The canvas gives itself a description when the patients are placed and start to move.
    await page
      .getByRole('img', { name: /placed by the risk the model gave them/ })
      .waitFor({ state: 'visible', timeout: PATIENCE });
    begin(page);
    const diabetes = page
      .getByRole('group', { name: 'Show the patients for' })
      .getByRole('button', { name: 'Diabetes' });
    await atSecond(page, 3, () => click(page, diabetes));
    // The first set has landed by about three seconds. The new set lands within a second and
    // a half of the click, and the canvas gives no sign of it, so wait that long and a little more.
    await atSecond(page, 3 + 1.8);
  },

  // A vehicle counter. The road is simulated in the page: once the device check ends, cars drive
  // through the counting line and the display ticks up.
  async trafficlens(page) {
    await page
      .getByText(/^[1-9]\d* vehicles? counted at the line/)
      .waitFor({ state: 'attached', timeout: PATIENCE });
    begin(page);
    // A poster of the first car would show an empty road and a one; let the traffic build.
    await atSecond(page, 6);
  },

  // A referee that watches players for movement. Its demo match is drawn players on a timer:
  // a lobby, a countdown, then alternating green and red lights until the match ends.
  async 'red-light-green-light-cv'(page) {
    await page.locator('#stage[data-phase="GREEN"]').waitFor({ state: 'attached', timeout: PATIENCE });
    begin(page);
    // The first call (a player moved on red) goes up about a second into the first red light.
    // The red light lasts a little over two seconds, so this is the page at its most
    // recognisable: the referee's face turned round, the light red and the call on screen.
    await page.locator('#stage[data-phase="RED"]').waitFor({ state: 'attached', timeout: 10_000 });
    await page.locator('#whyCard[data-show="true"]').waitFor({ state: 'attached', timeout: 10_000 });
  },

  // Virtual makeup. The engine reveals the sample portrait (mesh, then masks, then colour, then
  // the before and after split slides in); once that has finished the look can be switched.
  async carmine(page) {
    const mirror = page.getByRole('group', { name: 'Makeup mirror' });
    // The mirror names itself as soon as the engine starts drawing, so the loop has the reveal.
    await mirror.waitFor({ state: 'visible', timeout: PATIENCE });
    begin(page);
    // The status line reads "Sample photo" again once the reveal is over.
    await mirror.getByRole('status').filter({ hasText: 'Sample photo' }).waitFor({ timeout: PATIENCE });
    const velvet = page.getByRole('tabpanel', { name: 'Looks' }).getByRole('button', { name: /^Velvet/ });
    await atSecond(page, 5, () => click(page, velvet));
    // The new look is painted in over about a second.
    await atSecond(page, 6.5);
  },

  // A price estimator for Gurgaon homes. The suggestion chips fill in the form, move the lit
  // tower on the skyline and count the estimate to its new figure.
  async homecast(page) {
    const price = page.locator('p.price');
    const announced = page.getByRole('status').filter({ hasText: 'Estimated price' });
    const text = (locator) => locator.innerText().then((s) => s.replace(/\s+/g, '')).catch(() => '');
    // The big figure counts to the estimate the page announces to screen readers. Parked at the
    // typical listing's figure it is still but not finished; it is finished when it shows what
    // was announced and stays there.
    const landed = async () => {
      const shown = await text(price);
      return shown !== '' && (await text(announced)).includes(shown);
    };
    const lands = (what) => settled(async () => String(await landed()), what, { quiet: 500, ready: (v) => v === 'true' });
    await lands('the first estimate to land');
    begin(page);
    await atSecond(page, 1, () => click(page, page.getByRole('button', { name: '4BHK house in Sector 26' })));
    await atSecond(page, 5, () => click(page, page.getByRole('button', { name: '2BHK flat on Sohna Road' })));
    await sleep(600);
    await lands('the last estimate to land');
  },
};
