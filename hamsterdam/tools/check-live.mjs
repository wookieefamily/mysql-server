// HAMSTERDAM — check a deployed site.
//
//   node hamsterdam/tools/check-live.mjs <url> <password> [--write]
//
// Two rules this file obeys, both non-negotiable:
//
//   1. It prints no card text. The owner of the deck is going to read the
//      output and has asked not to see the cards. Deck checks come out as
//      counts and fingerprints, never titles.
//   2. Without --write it writes NOTHING. It does not flip teams, start a
//      day, complete a card or upload anything. Every check is a read.
//
// --write additionally exercises the compare-and-swap path, then puts a clean
// document back. It refuses to run if a game is already in progress.
//
// The browser half is optional. If playwright is not installed the HTTP
// checks still run and the script says which half it skipped — a partial
// answer beats no answer when somebody is standing over a deploy.

const [, , rawUrl, password, ...flags] = process.argv;
const URL_ = (rawUrl || '').replace(/\/+$/, '');
const WRITE = flags.includes('--write');

if (!URL_ || !password) {
  console.log('usage: node check-live.mjs <url> <password> [--write]');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
let skipped = 0;
const ok = (n, v, d = '') => {
  if (!v) fails++;
  console.log(`${v ? 'PASS' : 'FAIL'}  ${n}${d ? ` — ${d}` : ''}`);
};
const skip = (n, why) => { skipped++; console.log(`SKIP  ${n} — ${why}`); };

console.log(`Testing ${URL_}${WRITE ? '  (including the write path)' : ''}\n`);

// --- Reads over HTTP -------------------------------------------------------

const stateRes = await fetch(`${URL_}/api/state`);
ok('the shared store answers', stateRes.ok, `HTTP ${stateRes.status}`);
if (!stateRes.ok) {
  console.log('\nThe function is not responding. Nothing else is worth checking.');
  process.exit(1);
}
const doc = await stateRes.json();
ok('the store returns a document', typeof doc.version === 'number', `version ${doc.version}`);
ok('the ETag is set, so four phones poll cheaply',
  !!stateRes.headers.get('etag'), stateRes.headers.get('etag') || 'missing');

// A 304 on an unchanged poll is what keeps four phones off mobile data all day.
const notModified = await fetch(`${URL_}/api/state`, {
  headers: { 'if-none-match': stateRes.headers.get('etag') || '' },
});
ok('an unchanged poll costs a 304 and no body', notModified.status === 304, `HTTP ${notModified.status}`);

const inProgress = doc.state !== null && doc.state !== undefined;
ok('a game is not already in progress', !inProgress,
  inProgress ? 'THERE IS STATE IN THE STORE — see the note at the end' : 'store is fresh');

for (const f of ['', 'app.js', 'engine.js', 'net.js', 'content.js', 'ledger.css']) {
  const r = await fetch(`${URL_}/${f}`);
  ok(`${f || 'index.html'} is served`, r.ok, `HTTP ${r.status}`);
}

// --- The deck, counted but never quoted ------------------------------------

const src = await (await fetch(`${URL_}/content.js`)).text();
const mod = await import(`data:text/javascript;base64,${Buffer.from(src).toString('base64')}`);
const c = mod.content || mod.default;

ok('the password matches the one being tested', c.password === password,
  c.password === password ? 'as documented' : 'THE README AND THE FILE DISAGREE');
ok('the clock runs in real time', c.clock.speedFactor === 1);
ok('the clock reads the actual time of day', c.clock.fixedStart === null);
ok('"start this day over" is available', c.allowReset === true);
ok('"clear everything" is switched off', c.allowResetAll === false);

for (const d of c.days) {
  const cards = d.sequence.filter((e) => e.kind === 'card');
  const curses = d.sequence.filter((e) => e.kind === 'curse');
  const missing = d.sequence.filter((e) => !(e.kind === 'card' ? c.cards : c.curses)[e.id]);
  ok(`${d.label} is intact`, missing.length === 0,
    `${cards.length} cards + ${curses.length} curses, whistle ${d.whistle}` +
    (missing.length ? ` — ${missing.length} MISSING` : ''));
}

// --- The write path --------------------------------------------------------
//
// Skipped by default. The compare-and-swap loop is what every tap on every
// phone goes through, and it is the one thing a read-only check cannot prove.

if (!WRITE) {
  skip('the write path', 'pass --write to test it');
} else if (inProgress) {
  skip('the write path', 'a game is in progress — refusing to touch it');
} else {
  const v0 = doc.version;
  const probe = { probe: 'check-live', at: new Date().toISOString() };

  const w1 = await fetch(`${URL_}/api/state`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ expectedVersion: v0, state: probe }),
  });
  const w1doc = await w1.json();
  ok('a write is accepted', w1.ok && w1doc.version === v0 + 1,
    `HTTP ${w1.status}, version ${v0} -> ${w1doc.version}`);

  // The 409 is the whole point: two phones tapping at once must not clobber
  // each other. Replaying the now-stale version has to be refused.
  const w2 = await fetch(`${URL_}/api/state`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ expectedVersion: v0, state: { probe: 'stale' } }),
  });
  const w2doc = await w2.json();
  ok('a stale write is refused, not silently applied', w2.status === 409, `HTTP ${w2.status}`);
  ok('the refusal hands back the current document so a phone can retry',
    w2doc && w2doc.version === v0 + 1, `it returned version ${w2doc && w2doc.version}`);

  // A 1x1 PNG. Photos are keyed by id and never referenced by a clean
  // document, so this leaves one orphaned 70-byte blob behind. Harmless.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64');
  const pid = `probe-${v0}-check`;
  const up = await fetch(`${URL_}/api/photo/${pid}`, {
    method: 'PUT', headers: { 'content-type': 'image/png' }, body: png,
  });
  ok('a photo uploads', up.ok, `HTTP ${up.status}`);
  const down = await fetch(`${URL_}/api/photo/${pid}`);
  const back = down.ok ? Buffer.from(await down.arrayBuffer()) : Buffer.alloc(0);
  ok('the photo reads back byte for byte', back.equals(png), `${back.length} of ${png.length} bytes`);

  // Put a clean document back. The version counter keeps climbing, which is
  // cosmetic — a fresh state at version 3 plays exactly like one at version 0.
  const cur = await (await fetch(`${URL_}/api/state`)).json();
  const restore = await fetch(`${URL_}/api/state`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ expectedVersion: cur.version, state: null }),
  });
  ok('the store is left clean', restore.ok, `HTTP ${restore.status}`);
  const after = await (await fetch(`${URL_}/api/state`)).json();
  ok('nothing is left behind — no teams flipped, no day started',
    after.state === null, `state is ${JSON.stringify(after.state)}`);
}

// --- The browser, read-only ------------------------------------------------

// Resolve playwright from this file first, then from wherever the command was
// run. ESM ignores NODE_PATH, so an install that lives next to the caller
// rather than next to the script has to be found deliberately.
let chromium = null;
try {
  ({ chromium } = await import('playwright'));
} catch {
  try {
    const { createRequire } = await import('node:module');
    const req = createRequire(`${process.cwd()}/`);
    // Imported by path, playwright's CommonJS entry arrives on `default`
    // rather than as a named export.
    const m = await import(`file://${req.resolve('playwright')}`);
    chromium = m.chromium || (m.default && m.default.chromium) || null;
  } catch { /* optional — the HTTP checks stand on their own */ }
}

if (!chromium) {
  skip('every browser check', 'playwright is not installed — run: npm i playwright');
} else {
  const { existsSync, readdirSync } = await import('node:fs');
  // The pre-installed browser moves between images, so find it rather than
  // hardcoding a version that will rot.
  let exe;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (existsSync(root)) {
    for (const dir of readdirSync(root)) {
      const p = `${root}/${dir}/chrome-linux/chrome`;
      if (dir.startsWith('chromium') && existsSync(p)) { exe = p; break; }
    }
  }

  const browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox'] });
  const ctx = await browser.newContext({
    viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  });
  const page = await ctx.newPage();
  const errors = [];
  const bad = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => { if (r.status() >= 400 && r.status() !== 304) bad.push(`${r.status()} ${r.url().replace(URL_, '')}`); });

  await page.goto(`${URL_}/`, { waitUntil: 'networkidle' });
  await sleep(1200);

  ok('the page draws on an iPhone-sized screen', (await page.locator('#app').innerText()).length > 0);
  ok('the password gate is up', (await page.locator('#pw').count()) === 1);
  ok('no DEMO banner', (await page.locator('#banner:not(.hide)').count()) === 0);

  await page.fill('#pw', 'definitely-not-it');
  await page.click('button[data-act="unlock"]');
  await sleep(700);
  ok('a wrong password is refused', (await page.locator('#pw').count()) === 1);

  await page.fill('#pw', password);
  await page.click('button[data-act="unlock"]');
  await sleep(900);
  const pickers = await page.locator('button[data-act="pickme"]').count();
  ok('the right password lets you in and offers four players', pickers === 4, `${pickers} players`);

  // Picking a player is stored on the phone, not in shared state — safe.
  await page.click('button[data-act="pickme"]');
  await sleep(800);
  const controls = page.locator('button[data-act="flip"], button[data-act="start"]');
  const has = (await controls.count()) > 0;
  ok('the morning screen offers the flip or the start', has);
  ok('that control is live, not dead', !has || !(await controls.first().isDisabled()));

  for (const t of ['ledger', 'dinner', 'play']) {
    await page.click(`button[data-act="tab"][data-id="${t}"]`).catch(() => {});
    await sleep(400);
  }
  ok('all three tabs draw', (await page.locator('#app').innerText()).length > 0);

  ok('no JavaScript errors anywhere', errors.length === 0, errors.slice(0, 2).join(' | ') || 'clean');
  ok('no missing files or failed requests', bad.length === 0, bad.slice(0, 3).join(' | ') || 'clean');

  await browser.close();
}

// Stopping short of the flip on purpose: it cannot be re-rolled, so a test tap
// would permanently settle Days One and Two.
const end = await (await fetch(`${URL_}/api/state`)).json();
ok('the teams are still unflipped', !end.state || !end.state.setup || !end.state.setup.flipped);

console.log(`\n${fails === 0 ? 'ALL CLEAR' : `${fails} FAILED`}${skipped ? `, ${skipped} skipped` : ''}`);
if (inProgress) {
  console.log('\nNOTE: the store already holds a game. That is expected mid-trip and');
  console.log('means the write checks were skipped rather than risk your day.');
}
process.exit(fails === 0 ? 0 : 1);
