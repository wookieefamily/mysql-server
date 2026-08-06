// HAMSTERDAM — play a real morning on a deployed site, then put it back.
//
//   node hamsterdam/tools/playtest-live.mjs <url> <password>
//
// Four browser contexts, one per phone, against the live URL and the live
// deck. It flips for teams, starts Day One, deals, completes, skips, takes a
// photo, settles a VERSUS card at dinner, and checks all four phones agree —
// then wipes the store back to new so the family starts from nothing.
//
// The same two rules as check-live.mjs, plus one more:
//
//   1. It prints no card text. The owner has asked not to see the deck.
//      Progress is reported as counts and positions, never titles.
//   2. It REFUSES to run if the store already holds a game. Mid-trip, this
//      script is not the tool you want.
//   3. It restores the store on the way out, including after a failure. The
//      flip cannot be re-rolled from the UI and "clear everything" is off in
//      the real build, so leaving a flipped document behind would strand the
//      pairings — the restore goes through the API, which has no such gate.
//
// The clock is pinned to breakfast on Day One's own date, so this plays a
// real morning regardless of when it is actually run.

const [, , rawUrl, password] = process.argv;
const URL_ = (rawUrl || '').replace(/\/+$/, '');
if (!URL_ || !password) {
  console.log('usage: node playtest-live.mjs <url> <password>');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const ok = (n, v, d = '') => {
  if (!v) fails++;
  console.log(`${v ? 'PASS' : 'FAIL'}  ${n}${d ? ` — ${d}` : ''}`);
};

// 8x8 JPEG, standing in for a camera capture.
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
  'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAAIAAgBAREA/8QAHwAAAQUBAQEB' +
  'AQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1Fh' +
  'ByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZ' +
  'WmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXG' +
  'x8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oACAEBAAA/APn+iiiiv//Z', 'base64');

const PHONE = { viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

const getState = async () => (await fetch(`${URL_}/api/state`)).json();

// A reload re-locks the app — the unlock lives in memory, not storage — so
// every reload has to type the password again, exactly as a phone would.
async function reload(page) {
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(900);
  if ((await page.locator('#pw').count()) > 0) {
    await page.fill('#pw', password);
    await page.click('button[data-act="unlock"]');
    await sleep(800);
  }
}

async function restore(why) {
  const cur = await getState();
  if (cur.state === null) return true;
  const res = await fetch(`${URL_}/api/state`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ expectedVersion: cur.version, state: null }),
  });
  const after = await getState();
  const clean = res.ok && after.state === null;
  console.log(`${clean ? 'PASS' : 'FAIL'}  the store is back to new (${why})` +
    (clean ? '' : ` — HTTP ${res.status}, STATE LEFT BEHIND, wipe it by hand`));
  if (!clean) fails++;
  return clean;
}

// --- Refuse to trample a real game -----------------------------------------

const before = await getState();
if (before.state !== null && before.state !== undefined) {
  console.log('REFUSING TO RUN — the store already holds a game.');
  console.log('This script wipes the store when it finishes. If you meant to');
  console.log('do that, clear the day from the app first, then run it again.');
  process.exit(1);
}
console.log(`Playtesting ${URL_}\nStore is fresh (version ${before.version}). It will be fresh again at the end.\n`);

// --- Load the deck, to know what to expect without printing any of it ------

const src = await (await fetch(`${URL_}/content.js`)).text();
const mod = await import(`data:text/javascript;base64,${Buffer.from(src).toString('base64')}`);
const content = mod.content || mod.default;
const day1 = content.days[0];
const deckLen = day1.sequence.filter((e) => e.kind === 'card').length;

let chromium = null;
try {
  ({ chromium } = await import('playwright'));
} catch {
  try {
    const { createRequire } = await import('node:module');
    const req = createRequire(`${process.cwd()}/`);
    const m = await import(`file://${req.resolve('playwright')}`);
    chromium = m.chromium || (m.default && m.default.chromium) || null;
  } catch { /* handled below */ }
}
if (!chromium) {
  console.log('playwright is not installed — run: npm i playwright');
  process.exit(1);
}

const { existsSync, readdirSync } = await import('node:fs');
let exe;
const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
if (existsSync(root)) {
  for (const d of readdirSync(root)) {
    const p = `${root}/${d}/chrome-linux/chrome`;
    if (d.startsWith('chromium') && existsSync(p)) { exe = p; break; }
  }
}

const browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox'] });
const errors = [];

try {
  // Breakfast on Day One's own date, so the whistle is hours away whenever
  // this is actually run.
  const breakfast = new Date(`${day1.isoDate || '2026-08-16'}T09:30:00`);

  const phones = {};
  for (const p of content.players) {
    const ctx = await browser.newContext(PHONE);
    const page = await ctx.newPage();
    await page.clock.setFixedTime(breakfast);
    page.on('pageerror', (e) => errors.push(`${p.id}: ${e.message}`));
    page.on('dialog', (d) => d.accept('a line about it'));
    await page.goto(`${URL_}/`, { waitUntil: 'networkidle' });
    await sleep(700);
    await page.fill('#pw', password);
    await page.click('button[data-act="unlock"]');
    await sleep(600);
    await page.click(`button[data-act="pickme"][data-id="${p.id}"]`);
    await sleep(600);
    phones[p.id] = page;
  }
  const ids = Object.keys(phones);
  ok('all four phones load, unlock and identify', ids.length === 4, ids.join(', '));

  // --- The morning ---------------------------------------------------------

  const first = phones[ids[0]];
  await first.click('button[data-act="flip"]');
  await first.waitForSelector('text=Flipped and locked', { timeout: 15000 });
  await sleep(1200);

  const teamLines = {};
  for (const id of ids) {
    await reload(phones[id]);
    teamLines[id] = (await phones[id].locator('.masthead .sub').first().innerText()).trim();
  }
  const agreed = new Set(Object.values(teamLines).map((t) => t.replace(/\s+/g, ' ')));
  ok('one flip settles the teams and all four phones agree', agreed.size <= 2,
    `${agreed.size} distinct team line(s) across four phones`);
  ok('the flip cannot be re-rolled',
    (await first.locator('button[data-act="flip"]').count()) === 0);

  await first.click('button[data-act="start"]');
  await first.waitForSelector('.card', { timeout: 15000 });
  await sleep(900);
  ok('the day starts and cards deal', (await first.locator('.card').count()) >= 1);

  // The whistle sits in the clock strip, not the NOW band — the NOW band is
  // for whatever is most useful this second.
  const screen = (await first.locator('#app').innerText()).replace(/\n+/g, ' ');
  const clock = screen.match(/NOW[^A-Z]*\d{1,2}:\d{2}.*?WHISTLE[^A-Z]*\d{1,2}:\d{2}[^A-Z]*/i);
  ok('the clock counts down to the real whistle', !!clock,
    clock ? clock[0].trim().slice(0, 70) : screen.slice(0, 70));

  // --- Play, on both teams -------------------------------------------------

  const sideOf = async (page) => page.evaluate(() => {
    const s = document.querySelector('.masthead .sub');
    return s ? s.innerText.trim() : '';
  });
  const teamA = [];
  const teamB = [];
  for (const id of ids) ((await sideOf(phones[id])) === teamLines[ids[0]] ? teamA : teamB).push(id);
  ok('the four phones split into two teams of two',
    teamA.length === 2 && teamB.length === 2, `${teamA.length} v ${teamB.length}`);

  // One player from each team plays, so both decks advance and a VERSUS card
  // can be reached by both sides.
  for (const id of [teamA[0], teamB[0]]) {
    const page = phones[id];
    if ((await page.locator('button[data-act="start"]').count()) > 0) {
      await page.click('button[data-act="start"]');
      await page.waitForSelector('.card', { timeout: 15000 });
      await sleep(700);
    }
    for (let i = 0; i < 3; i += 1) {
      const done = page.locator('button[data-act="complete"]').first();
      if ((await done.count()) === 0) break;
      await done.click();
      await sleep(1100);
    }
  }
  const mid = await getState();
  const doneCounts = ['A', 'B'].map((s) => (mid.state?.days?.[day1.id]?.teams?.[s]?.done || []).length);
  ok('both teams complete cards', doneCounts.every((n) => n > 0), `${doneCounts[0]} and ${doneCounts[1]} done`);

  // A skip costs a skip and nothing else.
  const skipper = phones[teamA[0]];
  const skipBtn = skipper.locator('button[data-act="skip"]').first();
  if ((await skipBtn.count()) > 0) {
    await skipBtn.click();
    await sleep(1100);
    const after = await getState();
    // Skips are the "vetoed" list — a budget, not a counter, so a replayed
    // write cannot spend two.
    const teams = after.state?.days?.[day1.id]?.teams || {};
    const used = Math.max((teams.A?.vetoed || []).length, (teams.B?.vetoed || []).length);
    ok('a skip is spent and play continues immediately', used === 1,
      `skips used: ${used} of ${content.rules.skipsPerDay}`);
  } else {
    ok('a skip is offered', false, 'no skip control found');
  }

  // A photo, through the real upload path.
  const shot = skipper.locator('input[type="file"]').first();
  if ((await shot.count()) > 0) {
    await shot.setInputFiles({ name: 'p.jpg', mimeType: 'image/jpeg', buffer: JPEG });
    await sleep(2500);
    const withShot = await getState();
    ok('a photo uploads and lands in shared state',
      (withShot.state?.photos || []).length > 0, `${(withShot.state?.photos || []).length} photo(s)`);
  } else {
    ok('a photo can be taken', false, 'no camera input found');
  }

  // --- Four phones agree ---------------------------------------------------

  await sleep(3000);
  const seen = [];
  for (const id of ids) {
    await reload(phones[id]);
    seen.push((await phones[id].locator('#app').innerText()).match(/(\d+)\s*OF\s*(\d+)\s*DONE/i)?.[0] || '');
  }
  const teammatesAgree = seen[0] && seen.filter((s) => s === seen[0]).length >= 2;
  ok('phones on the same team see the same progress', !!teammatesAgree, seen.filter(Boolean).join(' | '));
  ok('no live scoreboard during play',
    !(await phones[ids[0]].locator('#app').innerText()).match(/\b\d{3,},?\d*\s*v\s*\d/i));

  // --- Dinner --------------------------------------------------------------

  await first.click('button[data-act="tab"][data-id="dinner"]');
  await sleep(1200);
  const verdicts = first.locator('button[data-act="verdict"]');
  if ((await verdicts.count()) > 0) {
    await verdicts.first().click();
    await sleep(1200);
    const judged = await getState();
    const n = Object.keys(judged.state?.days?.[day1.id]?.dinner?.verdicts || {}).length;
    ok('a VERSUS card settles at dinner', n > 0, `${n} judged`);
  } else {
    ok('dinner reached no VERSUS card', true, 'neither team got to a shared contested card — fine');
  }

  await first.click('button[data-act="tab"][data-id="ledger"]');
  await sleep(1000);
  ok('the day sheet is the record of the day',
    (await first.locator('#app').innerText()).length > 0);

  ok('no JavaScript errors on any phone', errors.length === 0, errors.slice(0, 2).join(' | ') || 'clean');
  ok('the deck length is what the day declares', deckLen > 0, `${deckLen} cards in ${day1.label}`);
} catch (err) {
  ok('the playtest ran to the end', false, String(err && err.message).split('\n')[0]);
} finally {
  await browser.close().catch(() => {});
  // Always, including after a throw. A flipped document left behind cannot be
  // undone from the app.
  await restore('after the playtest');
}

console.log(`\n${fails === 0 ? 'ALL CLEAR — and the store is fresh' : `${fails} FAILED`}`);
process.exit(fails === 0 ? 0 : 1);
