/* Plays Crosspup in a real browser and checks the board, the controls and
   the saved progress.  Needs Playwright and a Chromium build:

       npm i playwright
       node tests/ui.test.js

   Set CHROME to point at a browser if the bundled download is missing.
   The test skips itself (exit 0) when Playwright is not installed.
*/
const path = require("path");
const fs = require("fs");

let chromium;
try { ({ chromium } = require("playwright")); }
catch (e) {
  console.log("playwright not installed — skipping the browser test");
  process.exit(0);
}

const PAGE = "file://" + path.join(__dirname, "..", "dist", "index.html");
const CHROME = process.env.CHROME || "/opt/pw-browsers/chromium";

let failures = 0;
const t = (name, ok, detail) => {
  if (ok) console.log("  ok    " + name);
  else { failures++; console.log("  FAIL  " + name + (detail ? " — " + detail : "")); }
};

(async () => {
  const browser = await chromium.launch(
    fs.existsSync(CHROME) ? { executablePath: CHROME } : {}
  );
  const ctx = await browser.newContext({ viewport: { width: 700, height: 1100 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push("PAGEERROR: " + e.message));
  p.on("console", (m) => {
    if (m.type() === "error" && !/ERR_CONNECTION|fonts\.g/.test(m.text())) errs.push(m.text());
  });

  await p.goto(PAGE);
  await p.waitForTimeout(400);

  const state = () => p.evaluate(() => (game ? {
    cell: game.cell, N: game.N, level: game.puzzle.level,
    solution: game.puzzle.solution, region: game.puzzle.region,
    undo: game.undo.length, hints: game.hints, done: game.done,
  } : null));

  /* ---------- the level list ---------- */
  t("level 1 is open, level 2 is not",
    (await p.locator(".lv:not(.locked)").count()) === 1 &&
    (await p.locator(".lv.locked").count()) > 0);
  t("far-off chapters are collapsed, not 200 dead tiles",
    (await p.locator(".locked-note").count()) >= 4);

  /* ---------- opening a level ---------- */
  await p.click(".lv.next");
  await p.waitForTimeout(300);
  let s = await state();
  t("level 1 opens a 4×4 yard", s && s.N === 4 && (await p.locator(".cell").count()) === 16);
  t("the yard walls are drawn",
    (await p.locator("#wall-path").getAttribute("d")).length > 20);

  /* ---------- tap cycling: empty, crossed out, pup, empty ---------- */
  await p.click('.cell[data-i="0"]');
  s = await state();
  t("one tap crosses a square out", s.cell[0] === 2);
  t("a crossed square shows its mark", await p.locator('.cell[data-i="0"] .no.on').count() === 1);

  await p.click('.cell[data-i="0"]');
  s = await state();
  t("a second tap puts a pup down", s.cell[0] === 1);
  t("the pup is visible", await p.locator('.cell[data-i="0"] img:not([hidden])').count() === 1);
  t("only the crossed squares show a cross",
    (await p.locator(".cell .no.on").count()) === 0);

  await p.click('.cell[data-i="0"]');
  s = await state();
  t("a third tap clears the square", s.cell[0] === 0);

  /* ---------- right click drops a pup straight in ---------- */
  await p.click('.cell[data-i="3"]', { button: "right" });
  s = await state();
  t("right-click places a pup", s.cell[3] === 1);

  /* ---------- the rules are enforced ---------- */
  await p.evaluate(() => {
    game.cell = new Array(16).fill(0);
    setCell(0, 1); setCell(2, 1);           // same row
    render();
  });
  t("two pups in one row are flagged", await p.locator(".cell.bad").count() === 2);

  await p.evaluate(() => { game.cell = new Array(16).fill(0); setCell(0, 1); setCell(5, 1); render(); });
  t("two pups touching diagonally are flagged", await p.locator(".cell.bad").count() === 2);

  await p.evaluate(() => { game.cell = new Array(16).fill(0); render(); });

  /* ---------- undo and clear ---------- */
  await p.click('.cell[data-i="1"]');
  await p.click("#t-undo");
  s = await state();
  t("undo takes the last mark back", s.cell[1] === 0);

  await p.click('.cell[data-i="1"]');
  await p.click('.cell[data-i="6"]');
  await p.click("#t-reset");
  s = await state();
  t("clear empties the yard", s.cell.every((v) => v === 0));

  /* ---------- hints ---------- */
  await p.click("#t-hint");
  await p.waitForTimeout(200);
  const hintText = await p.locator("#hintline").innerText();
  s = await state();
  t("a hint explains its reasoning", hintText.length > 25 && /yard|row|column/i.test(hintText));
  t("a hint counts against the round", s.hints === 1);
  t("the hint points at a square", await p.locator(".cell.tip").count() >= 1);
  t("a hint does not place anything for you", s.cell.every((v) => v === 0));

  /* ---------- helper: cross out for me ---------- */
  await p.click("#btn-settings");
  await p.click("#set-auto");
  await p.click("#btn-settings");
  await p.evaluate(() => { game.cell = new Array(16).fill(0); render(); setCell(game.puzzle.solution[0], 1); });
  s = await state();
  t("the helper crosses off what a pup rules out",
    s.cell.filter((v) => v === 2).length >= 5, `${s.cell.filter((v) => v === 2).length} crossed`);
  await p.click("#btn-settings");
  await p.click("#set-auto");
  await p.click("#btn-settings");

  /* ---------- winning ---------- */
  await p.evaluate(() => {
    game.cell = new Array(game.N * game.N).fill(0);
    for (const i of game.puzzle.solution) game.cell[i] = 1;
    render(); checkWin();
  });
  await p.waitForTimeout(300);
  s = await state();
  t("a correct yard wins", s.done === true);
  t("the win card appears", await p.locator("#win:not([hidden])").count() === 1);
  t("the win card offers the next level",
    (await p.locator("#win-next").innerText()).includes("Level 2"));

  await p.click("#win-next");
  await p.waitForTimeout(300);
  s = await state();
  t("next level opens, at the size its chapter promises",
    s.level === 2 && s.N === await p.evaluate(() => LEVELS[1].N), `level ${s && s.level}, ${s && s.N}×${s && s.N}`);

  await p.click("#btn-back");
  await p.waitForTimeout(200);
  t("level 1 now shows as solved", await p.locator(".lv.done").count() === 1);
  t("level 2 is unlocked", await p.locator(".lv.next").count() === 1);
  t("progress is counted", (await p.locator("#done-count").innerText()) === "1");

  /* ---------- a wrong board does not win ---------- */
  await p.click(".lv.next");
  await p.waitForTimeout(300);
  await p.evaluate(() => {
    game.cell = new Array(game.N * game.N).fill(0);
    // right count, wrong places: every pup down the first column
    for (let r = 0; r < game.N; r++) game.cell[r * game.N] = 1;
    render(); checkWin();
  });
  s = await state();
  t("a board with the right number of pups in the wrong places does not win", !s.done);
  t("and it says how many are clashing",
    (await p.locator("#tally-warn").innerText()).includes("clashing"));
  await p.click("#btn-back");

  /* ---------- progress survives a reload ---------- */
  await p.reload();
  await p.waitForTimeout(400);
  t("solved levels survive a reload", await p.locator(".lv.done").count() === 1);

  /* ---------- free play ---------- */
  await p.click("#tab-free");
  await p.click('#free-size .chip >> nth=1');       // 6×6
  await p.click("#btn-free-go");
  await p.waitForTimeout(2500);
  s = await state();
  t("free play deals a fresh yard", s && s.N === 6 && !s.level);
  t("its answer obeys the rules", await p.evaluate(() => {
    const { N, region, solution } = game.puzzle;
    const board = new Array(N * N).fill(0);
    for (const i of solution) board[i] = 1;
    return conflicts(N, region, board).size === 0 && solution.length === N;
  }));
  await p.click("#btn-back");

  /* ---------- theme ---------- */
  await p.click("#btn-settings");
  await p.click("#set-dark");
  t("dark mode applies", (await p.evaluate(() => document.documentElement.dataset.theme)) === "dark");

  /* ---------- starting over ---------- */
  await p.click("#btn-wipe");
  await p.waitForTimeout(200);
  t("starting over relocks the ladder",
    (await p.locator(".lv.done").count()) === 0 &&
    (await p.locator("#done-count").innerText()) === "0");

  await browser.close();
  if (errs.length) { failures++; console.log("\nPAGE ERRORS:\n" + errs.join("\n")); }
  console.log(failures ? `\n${failures} failing check(s)` : "\nall checks passed, no page errors");
  process.exit(failures ? 1 : 0);
})();
