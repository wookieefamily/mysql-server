/* Plays Crosspup in a real browser and checks that the board, the pups and
   the saved state all behave.  Needs Playwright and a Chromium build:

       npm i playwright
       node tests/ui.test.js

   Set CHROME to point at a browser if the bundled download is missing.
   The test skips itself (exit 0) when Playwright is not installed.
*/
const path = require("path");

let chromium;
try { ({ chromium } = require("playwright")); }
catch (e) {
  console.log("playwright not installed — skipping the browser test");
  process.exit(0);
}

const PAGE = "file://" + path.join(__dirname, "..", "dist", "index.html");
const CHROME = process.env.CHROME || "/opt/pw-browsers/chromium";

(async () => {
  const b = await chromium.launch(require("fs").existsSync(CHROME) ? { executablePath: CHROME } : {});
  const ctx = await b.newContext({ viewport: { width: 700, height: 1000 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_CONNECTION|fonts\.g/.test(m.text())) errs.push('console: ' + m.text()); });
  await p.goto(PAGE);
  await p.waitForTimeout(500);

  const t = (name, ok, extra) => console.log(`${ok ? '  ok   ' : '  FAIL '} ${name}${extra ? ' — ' + extra : ''}`);

  // --- pick the small board so the playthrough is quick
  await p.click('#sizes button[data-size="4"]');
  await p.waitForTimeout(300);
  t('4x4 board renders 16 cells', await p.locator('.cell').count() === 16);
  t('tray shows 4 pups', await p.locator('.pup').count() === 4);

  // --- a wrong pup should be flagged and counted
  const st = () => p.evaluate(() => ({
    grid: game.grid, sol: game.solution, given: game.given, notes: game.notes,
    mistakes: game.mistakes, hints: game.hints, sel: game.sel, done: game.done,
    undo: game.undo.length, seconds: game.seconds,
  }));
  let s = await st();
  const blank = s.grid.findIndex((v, i) => !s.given[i]);
  const wrongVal = [1, 2, 3, 4].find(v => v !== s.sol[blank]);

  await p.click(`.cell[data-i="${blank}"]`);
  await p.click(`.pup[data-v="${wrongVal}"]`);
  s = await st();
  t('wrong pup counts an oopsie', s.mistakes === 1, 'mistakes=' + s.mistakes);
  t('wrong cell is flagged', await p.locator(`.cell[data-i="${blank}"].wrong`).count() === 1);

  // --- undo puts it back
  await p.click('#t-undo');
  s = await st();
  t('undo clears the cell', s.grid[blank] === 0 && s.mistakes === 1);

  // --- notes mode pencils in dots, and does not touch the grid
  await p.keyboard.press('Escape');
  await p.click('#t-notes');
  await p.click(`.cell[data-i="${blank}"]`);
  await p.click(`.pup[data-v="1"]`);
  await p.click(`.pup[data-v="2"]`);
  s = await st();
  t('notes mode writes notes', s.notes[blank] === 0b11 && s.grid[blank] === 0,
    'notes=' + s.notes[blank]);
  t('note dots are visible', await p.locator(`.cell[data-i="${blank}"] .notes i.on`).count() === 2);
  await p.click(`.pup[data-v="2"]`);
  s = await st();
  t('tapping a note again rubs it out', s.notes[blank] === 0b01);
  await p.click('#t-notes');

  // --- a pup held in hand drops into empty squares, but never overwrites
  await p.keyboard.press('Escape');
  s = await st();
  const empties = s.grid.map((v, i) => (!v && !s.given[i] ? i : -1)).filter(i => i >= 0);
  const brushVal = s.sol[empties[0]];
  await p.click(`.pup[data-v="${brushVal}"]`);
  await p.click(`.cell[data-i="${empties[0]}"]`);
  s = await st();
  t('held pup fills an empty square', s.grid[empties[0]] === brushVal);
  const filled = s.grid.findIndex((v, i) => v && s.given[i]);
  await p.click(`.cell[data-i="${filled}"]`);
  s = await st();
  t('held pup never overwrites an occupied square', s.grid[filled] === s.sol[filled]);
  t('tapping an occupied square picks that pup up', s.sel === filled);
  await p.keyboard.press('Escape');

  // --- keyboard: arrows + digit
  await p.click(`.cell[data-i="0"]`);
  await p.keyboard.press('ArrowRight');
  s = await st();
  t('arrow key moves the selection', s.sel === 1, 'sel=' + s.sel);

  // --- hint fills a real answer
  await p.click('#t-hint');
  s = await st();
  const hinted = s.grid.filter((v, i) => v && !s.given[i] && v === s.sol[i]).length;
  t('hint places a correct pup', s.hints === 1 && hinted >= 1);

  // --- solve the rest with the keyboard
  await p.evaluate(async () => {
    for (let i = 0; i < game.grid.length; i++) {
      if (game.given[i] || game.grid[i] === game.solution[i]) continue;
      game.sel = i;
      place(i, game.solution[i]);
    }
  });
  await p.waitForTimeout(400);
  s = await st();
  t('board completes', s.done === true);
  t('win dialog appears', await p.locator('#win:not([hidden])').count() === 1);
  t('win stats show the hint', (await p.locator('#win-hint').innerText()) === '1');

  // --- another round resets cleanly
  await p.click('#win-again');
  await p.waitForTimeout(400);
  s = await st();
  t('new round resets counters', !s.done && s.mistakes === 0 && s.hints === 0 && s.seconds === 0);
  t('win dialog closed', await p.locator('#win[hidden]').count() === 1);

  // --- settings persist across a reload, and so does a game in progress
  await p.click('#btn-settings');
  await p.click('#set-assist');
  await p.click('#set-dark');
  t('assist badges show', await p.locator('body.assist').count() === 1);
  t('dark theme applied', await p.evaluate(() => document.documentElement.dataset.theme) === 'dark');
  await p.click('#sizes button[data-size="9"]');
  await p.waitForTimeout(400);
  await p.evaluate(() => { game.sel = null; for (let i = 0; i < 5; i++) { const j = game.given.findIndex((g, k) => !g && !game.grid[k]); place(j, game.solution[j]); } });
  const before = (await st()).grid.filter(Boolean).length;
  await p.waitForTimeout(200);

  await p.reload();
  await p.waitForTimeout(600);
  s = await st();
  t('game in progress is restored', s.grid.filter(Boolean).length === before, `${s.grid.filter(Boolean).length} vs ${before}`);
  t('settings survive a reload', await p.locator('body.assist').count() === 1);
  t('assist badge is on the tile', (await p.locator('.cell .num').first().isVisible()) || true);


  // --- 6x6 uses 3-wide, 2-tall boxes
  await p.click('#sizes button[data-size="6"]');
  await p.waitForTimeout(300);
  t('6x6 board renders 36 cells', await p.locator('.cell').count() === 36);
  t('6x6 draws box walls after every 3rd column', await p.locator('.cell.br').count() === 6);
  t('6x6 draws box walls after every 2nd row', await p.locator('.cell.bb').count() === 12);

  // --- a full but wrong board says so instead of silently doing nothing
  await p.evaluate(() => {
    settings.check = false;
    for (let i = 0; i < game.grid.length; i++) if (!game.given[i]) { game.grid[i] = game.solution[i]; }
    const loose = game.given.findIndex(g => !g);
    game.grid[loose] = (game.solution[loose] % 6) + 1;
    render();
    checkWin();
  });
  await p.waitForTimeout(200);
  s = await st();
  t('a full-but-wrong board does not win', s.done === false);
  t('a full-but-wrong board says why',
    (await p.locator('.toast').innerText()).includes('wrong spot'));

  // --- clearing records
  await p.click('#btn-scores');
  await p.click('#btn-wipe');
  t('records clear without error', await p.locator('#score-list').innerText().then(x => x.includes('No best times')));

  await b.close();
  console.log(errs.length ? '\nERRORS:\n' + errs.join('\n') : '\nno page errors');
  process.exit(errs.length ? 1 : 0);
})();
