/* Engine checks for Crosspup.  Pulls the puzzle engine straight out of
   src/index.html so the tests exercise the code that actually ships.

       node tests/engine.test.js
*/
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const page = fs.readFileSync(path.join(__dirname, "..", "src", "index.html"), "utf8");
const start = page.indexOf("const PUPS = [");
const end = page.indexOf("/* ==========================================================================\n   Saved state");
if (start < 0 || end < 0) throw new Error("could not locate the engine in src/index.html");

const sandbox = { console, Math };
vm.createContext(sandbox);
vm.runInContext(page.slice(start, end) + "\nthis.api = { SIZES, DIFFS, makePuzzle, countSolutions, boxOf };", sandbox);
const { SIZES, DIFFS, makePuzzle, countSolutions, boxOf } = sandbox.api;

let failures = 0;
function check(name, ok, detail) {
  if (!ok) { failures++; console.log("  FAIL  " + name + (detail ? " — " + detail : "")); }
  else console.log("  ok    " + name);
}

function validComplete(grid, cfg) {
  const N = cfg.N, seen = { r: [], c: [], b: [] };
  for (let i = 0; i < N * N; i++) {
    const v = grid[i];
    if (!v || v < 1 || v > N) return "cell " + i + " holds " + v;
    const r = (i / N) | 0, c = i % N, b = boxOf(r, c, cfg);
    for (const [k, g] of [["r", r], ["c", c], ["b", b]]) {
      seen[k][g] = seen[k][g] || new Set();
      if (seen[k][g].has(v)) return "duplicate " + v + " in " + k + g;
      seen[k][g].add(v);
    }
  }
  return null;
}

for (const size of [4, 6, 9]) {
  const cfg = SIZES[size];
  for (const diff of cfg.diffs) {
    const rounds = size === 9 ? 4 : 8;
    let worst = 0, clueMin = Infinity;
    for (let n = 0; n < rounds; n++) {
      const t0 = Date.now();
      const { solution, puzzle } = makePuzzle(size, diff);
      worst = Math.max(worst, Date.now() - t0);

      const bad = validComplete(solution, cfg);
      if (bad) { check(`${size} ${diff}: solution is a legal grid`, false, bad); break; }

      const clues = puzzle.filter(Boolean).length;
      clueMin = Math.min(clueMin, clues);
      if (puzzle.some((v, i) => v && v !== solution[i])) {
        check(`${size} ${diff}: clues match the solution`, false, "clue disagrees with answer");
        break;
      }
      const count = countSolutions(puzzle, cfg, 2);
      if (count !== 1) {
        check(`${size} ${diff}: exactly one answer`, false, "found " + count);
        break;
      }
    }
    const target = DIFFS[diff].clues[size];
    check(
      `${size}×${size} ${DIFFS[diff].name}: ${rounds} unique puzzles, ` +
      `${clueMin} clues (target ${target}), worst ${worst}ms`,
      clueMin <= target + Math.ceil(target * 0.25) && worst < 4000,
      clueMin > target ? "clue count drifted high" : "generation too slow"
    );
  }
}

// a grid with a hole that two pups could fill must read as ambiguous
const cfg4 = SIZES[4];
const { solution } = makePuzzle(4, "puppy");
const empty = new Array(16).fill(0);
check("an empty board has many answers", countSolutions(empty, cfg4, 2) === 2);
check("a finished board has exactly one", countSolutions(solution, cfg4, 2) === 1);
const broken = solution.slice();
broken[1] = broken[0];
check("a board with a repeat has none", countSolutions(broken, cfg4, 2) === 0);

console.log(failures ? `\n${failures} failing check(s)` : "\nall checks passed");
process.exit(failures ? 1 : 0);
