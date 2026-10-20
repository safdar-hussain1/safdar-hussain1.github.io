// ?selftest=1 runs these checks in the page and writes the verdict into the title, so a
// headless browser can read it without a screenshot: PORTFOLIO SELFTEST PASS n=<checks>.
export interface SelftestContext {
  document: Document;
  dock?: { open(slug: string): Promise<void>; close(): Promise<void>; current(): string | null } | null;
  palette?: { open(): void; close(): void; isOpen(): boolean } | null;
  stage?: { started: boolean; reason?: string } | null;
}

export interface SelftestResult {
  pass: boolean;
  n: number;
  failures: string[];
}

const STAGE_REASONS = ['narrow', 'reduced-motion', 'no-webgl2', 'software-gl', 'save-data', 'slow', 'still', 'off'];

function loadImage(src: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth > 0);
    img.onerror = () => resolve(false);
    img.src = src;
  });
}

export async function runSelftest(ctx: SelftestContext): Promise<SelftestResult> {
  const { document: doc } = ctx;
  const failures: string[] = [];
  let n = 0;
  const check = (name: string, ok: boolean) => {
    n += 1;
    if (!ok) failures.push(name);
  };

  const entries: Array<{ slug: string; live: string }> = JSON.parse(doc.querySelector('[data-dock-entries]')?.textContent ?? '[]');
  const cards = Array.from(doc.querySelectorAll<HTMLElement>('.plate[data-status="live"]'));
  check('live cards match the live entries', cards.length === entries.length && entries.every((e) => cards.some((c) => c.dataset.slug === e.slug)));

  const posters = await Promise.all(cards.map((c) => loadImage(c.querySelector<HTMLElement>('[data-poster]')?.dataset.poster ?? '')));
  check('every poster loads', posters.length > 0 && posters.every(Boolean));

  if (ctx.dock && entries[0]) {
    await ctx.dock.open(entries[0].slug);
    const frame = doc.querySelector<HTMLIFrameElement>('#dock iframe');
    const src = frame?.getAttribute('src') ?? '';
    check('the dock frames the first project by its path', ctx.dock.current() === entries[0].slug && src.endsWith(`/${entries[0].slug}/`));
    await ctx.dock.close();
    check('the dock closes', ctx.dock.current() === null && (doc.getElementById('dock') as HTMLElement | null)?.hidden === true);
  } else {
    check('the dock is present', false);
  }

  if (ctx.palette) {
    ctx.palette.open();
    const options = doc.querySelectorAll('#palette [role="option"]').length;
    check('the palette lists every live project', ctx.palette.isOpen() && options >= entries.length);
    ctx.palette.close();
  } else {
    check('the palette is present', false);
  }

  check('meta author', doc.querySelector('meta[name="author"]')?.getAttribute('content') === 'Safdar Hussain');
  check('the authorship comment', doc.documentElement.outerHTML.includes('Built by Safdar Hussain · https://github.com/safdar-hussain1'));
  check('the footer credit', /Built by Safdar Hussain\./.test(doc.querySelector('footer')?.textContent ?? ''));
  check('exactly one h1', doc.querySelectorAll('h1').length === 1);

  const stage = ctx.stage;
  check('the stage started or says why not', !!stage && (stage.started || STAGE_REASONS.includes(stage.reason ?? '')));

  return { pass: failures.length === 0, n, failures };
}

export function reportSelftest(result: SelftestResult, doc: Document = document): void {
  doc.title = result.pass ? `PORTFOLIO SELFTEST PASS n=${result.n}` : `PORTFOLIO SELFTEST FAIL ${result.failures[0]} (${result.failures.length} of ${result.n})`;
  const note = doc.createElement('p');
  note.id = 'selftest-result';
  note.className = 'meta';
  note.textContent = doc.title + (result.failures.length ? ': ' + result.failures.join('; ') : '');
  doc.body.prepend(note);
}
