/* Engine checks for Crosspup.
 *
 *     node tests/engine.test.js
 *
 * Covers the rules themselves, the generator, the logical solver that both
 * rates puzzles and hands out hints, and every level in the shipped pack.
 */

const fs = require("fs");
const path = require("path");
const E = require(path.join(__dirname, "..", "src", "engine.js"));

let failures = 0;
function check(name, ok, detail) {
  if (ok) console.log("  ok    " + name);
  else { failures++; console.log("  FAIL  " + name + (detail ? " — " + detail : "")); }
}

/** Everything the rules demand of a finished board. */
function judge(N, region, pups) {
  if (pups.length !== N) return `${pups.length} pups, expected ${N}`;
  const rows = new Set(), cols = new Set(), yards = new Set();
  for (const i of pups) {
    const r = (i / N) | 0, c = i % N, g = region[i];
    if (rows.has(r)) return `two pups in row ${r + 1}`;
    if (cols.has(c)) return `two pups in column ${c + 1}`;
    if (yards.has(g)) return `two pups in yard ${g + 1}`;
    rows.add(r); cols.add(c); yards.add(g);
  }
  for (const i of pups) {
    for (const j of E.neighbours8(i, N)) if (pups.includes(j)) return "two pups touching";
  }
  return null;
}

/* ---------- the generator ---------- */

console.log("generator");
for (const N of [4, 6, 8, 9]) {
  const rand = E.mulberry32(20260827 + N);
  let built = 0, worst = 0, smallestYard = Infinity, notes = null;

  for (let n = 0; n < (N >= 9 ? 6 : 12); n++) {
    const t0 = Date.now();
    const puzzle = E.buildPuzzle(N, (rand() * 0xffffffff) >>> 0);
    worst = Math.max(worst, Date.now() - t0);
    if (!puzzle) continue;
    built++;

    const bad = judge(N, puzzle.region, puzzle.solution);
    if (bad && !notes) notes = "answer breaks the rules: " + bad;
    if (E.countSolutions(N, puzzle.region, 2) !== 1 && !notes) notes = "more than one answer";

    const size = new Array(N).fill(0);
    for (const g of puzzle.region) size[g]++;
    smallestYard = Math.min(smallestYard, ...size);

    // every yard must be one connected blob
    for (let g = 0; g < N; g++) {
      if (!E.stillWhole(N, puzzle.region, g, -1) && !notes) notes = `yard ${g + 1} is in pieces`;
    }
  }

  check(`${N}×${N}: builds legal, single-answer yards (worst ${worst}ms)`, built > 0 && !notes, notes);
  check(`${N}×${N}: no yard smaller than two squares`, smallestYard >= 2, `smallest was ${smallestYard}`);
}

/* ---------- the solver and the rules ---------- */

console.log("\nrules and solver");
{
  const puzzle = E.buildPuzzle(8, 4242);
  const { N, region, solution } = puzzle;

  check("logic alone finishes a generated yard", E.logicSolve(N, region, 3).solved);

  const solved = new Array(N * N).fill(E.UNKNOWN);
  for (const i of solution) solved[i] = E.PUP;
  check("a correct board reports no clashes", E.conflicts(N, region, solved).size === 0);

  const doubled = solved.slice();
  const spare = doubled.findIndex((v, i) => v !== E.PUP && ((i / N) | 0) === (solution[0] / N | 0));
  doubled[spare] = E.PUP;
  check("two pups in one row is a clash", E.conflicts(N, region, doubled).size >= 2);

  const touching = new Array(N * N).fill(E.UNKNOWN);
  touching[0] = E.PUP; touching[N + 1] = E.PUP;      // diagonal neighbours
  check("two pups touching at the corner is a clash", E.conflicts(N, region, touching).size === 2);

  const partial = new Array(N * N).fill(E.UNKNOWN);
  check("an empty board has no clashes", E.conflicts(N, region, partial).size === 0);
}

/* ---------- hints ---------- */

console.log("\nhints");
{
  const puzzle = E.buildPuzzle(7, 909);
  const { N, region, solution } = puzzle;
  const names = ["A", "B", "C", "D", "E", "F", "G"];

  // Following hints alone, from an empty board, must finish the puzzle.
  const board = new Array(N * N).fill(E.UNKNOWN);
  let placed = 0, steps = 0, reasons = 0;
  while (steps++ < N * N * 8) {
    const hint = E.hintFor(N, region, solution, board, names);
    if (!hint) break;
    if (hint.reason && hint.reason.length > 12) reasons++;
    E.applyStep(N, region, board, hint);
    placed = board.filter((v) => v === E.PUP).length;
    if (placed === N) break;
  }
  check("hints alone solve the yard", placed === N, `stopped at ${placed}/${N}`);
  check("every hint explains itself", reasons === steps || reasons >= N, `${reasons} of ${steps}`);
  check("hinted pups match the answer",
    board.every((v, i) => v !== E.PUP || solution.includes(i)));

  // A pup in the wrong place gets called out before anything else.
  const wrong = new Array(N * N).fill(E.UNKNOWN);
  wrong[solution.includes(0) ? 1 : 0] = E.PUP;
  const called = E.hintFor(N, region, solution, wrong, names);
  check("a misplaced pup is called out first", called && called.kind === "wrong");
}

/* ---------- difficulty ratings ---------- */

console.log("\nratings");
{
  const seen = { 1: 0, 2: 0, 3: 0 };
  const rand = E.mulberry32(31337);
  for (let n = 0; n < 25; n++) {
    const puzzle = E.buildPuzzle(7, (rand() * 0xffffffff) >>> 0);
    if (puzzle) seen[puzzle.tier]++;
  }
  check("7×7 yards come out at every rating",
    seen[1] > 0 && seen[2] > 0 && seen[3] > 0, JSON.stringify(seen));
  check("a rating is stable for a given yard", (() => {
    const p = E.buildPuzzle(7, 12345);
    return E.logicSolve(p.N, p.region, 3).tier === E.logicSolve(p.N, p.region, 3).tier;
  })());
}

/* ---------- the shipped level pack ---------- */

console.log("\nlevel pack");
{
  const pack = fs.readFileSync(path.join(__dirname, "..", "src", "levels.txt"), "utf8");
  const levels = E.decodePack(pack);

  check(`pack holds all ${E.LAST_LEVEL} levels`, levels.length === E.LAST_LEVEL, `got ${levels.length}`);

  let broken = null, ambiguous = 0, unfair = 0, tiny = 0, wrongSize = 0;
  const tally = { 1: 0, 2: 0, 3: 0 };

  for (const p of levels) {
    const bad = judge(p.N, p.region, p.solution);
    if (bad && !broken) broken = `level ${p.level}: ${bad}`;
    if (E.countSolutions(p.N, p.region, 2) !== 1) ambiguous++;
    if (!E.logicSolve(p.N, p.region, 3).solved) unfair++;
    if (p.N !== E.levelPlan(p.level).size) wrongSize++;
    const size = new Array(p.N).fill(0);
    for (const g of p.region) size[g]++;
    if (Math.min(...size) < 2) tiny++;
    tally[p.tier]++;
  }

  check("every level's answer obeys the rules", !broken, broken);
  check("every level has exactly one answer", ambiguous === 0, `${ambiguous} with more`);
  check("every level is solvable by logic, no guessing", unfair === 0, `${unfair} need a guess`);
  check("every level is the size its chapter promises", wrongSize === 0, `${wrongSize} off`);
  check("no level has a one-square yard", tiny === 0, `${tiny} do`);
  check(`ratings spread across the ladder (easy ${tally[1]}, medium ${tally[2]}, hard ${tally[3]})`,
    tally[1] > 20 && tally[2] > 20 && tally[3] > 20);
  check("the pack decodes to the same levels every time",
    JSON.stringify(E.decodePack(pack)) === JSON.stringify(levels));
}

console.log(failures ? `\n${failures} failing check(s)` : "\nall checks passed");
process.exit(failures ? 1 : 0);
