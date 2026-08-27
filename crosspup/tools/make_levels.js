/* Builds the level pack.
 *
 *     node tools/make_levels.js [outfile]
 *
 * Searching for a yard that lands on an exact difficulty rating can take a
 * while on the big boards, which is fine here and not fine on a player's
 * phone — so the 200 levels are solved for once, at build time, and shipped
 * as a compact string that the game just reads.
 *
 * Each level encodes as base-36 characters:
 *
 *     [size][rating][one column per row][one region per square]
 *
 * The size comes first, so a reader knows how many characters follow.
 */

const fs = require("fs");
const path = require("path");
const E = require(path.join(__dirname, "..", "src", "engine.js"));

const OUT = process.argv[2] || path.join(__dirname, "..", "src", "levels.txt");
const b36 = (n) => n.toString(36);

function findLevel(level) {
  const { size, tier } = E.levelPlan(level);
  const budget = size >= 11 ? 25000 : size >= 10 ? 12000 : 6000;
  const started = Date.now();
  let best = null;

  for (let n = 0; n < 4000; n++) {
    if (best && Date.now() - started > budget) break;
    const seed = (Math.imul(level, 0x9e3779b1) ^ Math.imul(n + 1, 0x85ebca6b)) >>> 0;
    const puzzle = E.buildPuzzle(size, seed);
    if (!puzzle) continue;
    if (puzzle.tier === tier) return { puzzle, exact: true };
    if (!best || Math.abs(puzzle.tier - tier) < Math.abs(best.tier - tier)) best = puzzle;
    if (Date.now() - started > budget * 2) break;
  }
  return best ? { puzzle: best, exact: false } : null;
}

function encode(puzzle) {
  const cols = [];
  for (const i of puzzle.solution) cols.push(b36(i % puzzle.N));
  return b36(puzzle.N) + b36(puzzle.tier) + cols.join("") + puzzle.region.map(b36).join("");
}

const lines = [];
const tally = { 1: 0, 2: 0, 3: 0 };
let missed = 0;
const wall = Date.now();

for (let level = 1; level <= E.LAST_LEVEL; level++) {
  const started = Date.now();
  const found = findLevel(level);
  if (!found) {
    console.error(`level ${level}: could not build a yard`);
    process.exit(1);
  }
  const { puzzle, exact } = found;
  if (!exact) missed++;
  tally[puzzle.tier]++;
  lines.push(encode(puzzle));

  const took = Date.now() - started;
  if (took > 900 || level % 25 === 0 || level <= 3) {
    console.log(
      `level ${String(level).padStart(3)}  ${puzzle.N}×${puzzle.N}  ` +
      `${E.TIER_NAME[puzzle.tier].padEnd(6)}${exact ? "" : "(off target)"}  ${took}ms`
    );
  }
}

fs.writeFileSync(OUT, lines.join("\n") + "\n");

console.log(
  `\n${lines.length} levels, ${(fs.statSync(OUT).size / 1024).toFixed(1)} KB, ` +
  `${((Date.now() - wall) / 1000).toFixed(0)}s\n` +
  `easy ${tally[1]}  medium ${tally[2]}  hard ${tally[3]}` +
  (missed ? `  (${missed} off their target rating)` : "")
);
