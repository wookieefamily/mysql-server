/* ==========================================================================
   Crosspup engine — puzzle generation, solving and hints.

   The puzzle: an N×N yard split into N coloured regions. Every row, every
   column and every region holds exactly one pup, and no two pups may touch —
   not even at the corners.

   No DOM in here, so tests can run it straight in node.
   ========================================================================== */

const UNKNOWN = 0, PUP = 1, NOPE = 2;

/* ---------- seeded randomness ------------------------------------------
   Levels are generated on demand rather than shipped as data, so the
   randomness has to be reproducible: level 47 must be the same yard on
   every device, every time. */

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(list, rand) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = (rand() * (i + 1)) | 0;
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/* ---------- geometry ---------------------------------------------------- */

function neighbours8(i, N) {
  const r = (i / N) | 0, c = i % N, out = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < N && nc >= 0 && nc < N) out.push(nr * N + nc);
    }
  }
  return out;
}

function neighbours4(i, N) {
  const r = (i / N) | 0, c = i % N, out = [];
  if (r > 0) out.push(i - N);
  if (r < N - 1) out.push(i + N);
  if (c > 0) out.push(i - 1);
  if (c < N - 1) out.push(i + 1);
  return out;
}

/* ---------- laying out a yard ------------------------------------------- */

/** One pup per row and column, none touching: a permutation whose adjacent
 *  entries differ by at least two. */
function placePups(N, rand) {
  const cols = new Array(N).fill(-1);
  const used = new Array(N).fill(false);

  const go = (r) => {
    if (r === N) return true;
    for (const c of shuffle([...Array(N).keys()], rand)) {
      if (used[c]) continue;
      if (r > 0 && Math.abs(c - cols[r - 1]) < 2) continue;
      used[c] = true; cols[r] = c;
      if (go(r + 1)) return true;
      used[c] = false; cols[r] = -1;
    }
    return false;
  };

  return go(0) ? cols : null;
}

/** Grow N connected regions outward from the pups, one region per pup.
 *  Growing from the pups is what guarantees every region holds exactly one. */
function growRegions(N, seeds, rand) {
  const total = N * N;
  const region = new Array(total).fill(-1);
  const size = new Array(N).fill(1);
  const frontier = seeds.map((cell, r) => {
    region[cell] = r;
    return neighbours4(cell, N);
  });

  let left = total - N;
  let guard = total * 40;

  while (left > 0 && guard-- > 0) {
    // Regions are grown smallest-first most of the time, which keeps one
    // region from swallowing the yard, with enough randomness to keep the
    // shapes irregular.
    const live = [];
    for (let r = 0; r < N; r++) {
      frontier[r] = frontier[r].filter((c) => region[c] === -1);
      if (frontier[r].length) live.push(r);
    }
    if (!live.length) break;

    let pick;
    if (rand() < 0.7) {
      pick = live.reduce((a, b) => (size[b] < size[a] ? b : a), live[0]);
    } else {
      pick = live[(rand() * live.length) | 0];
    }

    // Reach for the frontier square with the fewest neighbours already in
    // this region. Regions come out long and winding rather than blobby,
    // which cuts the rival answers to sift through roughly in half.
    let thinnest = 99, choices = [];
    frontier[pick].forEach((c, k) => {
      const touching = neighbours4(c, N).filter((n) => region[n] === pick).length;
      if (touching < thinnest) { thinnest = touching; choices = [k]; }
      else if (touching === thinnest) choices.push(k);
    });
    const spot = frontier[pick].splice(choices[(rand() * choices.length) | 0], 1)[0];
    region[spot] = pick;
    size[pick]++;
    left--;
    for (const n of neighbours4(spot, N)) if (region[n] === -1) frontier[pick].push(n);
  }

  return left === 0 ? region : null;
}

/* ---------- exhaustive solver ------------------------------------------- */

/** Count solutions, stopping at `limit`.  One pup per row means the search
 *  is just a choice of column per row, which stays quick up to 11×11. */
function countSolutions(N, region, limit) {
  const usedCol = new Array(N).fill(false);
  const usedRegion = new Array(N).fill(false);
  let found = 0;

  const go = (r, prev) => {
    if (r === N) { found++; return; }
    for (let c = 0; c < N; c++) {
      if (usedCol[c]) continue;
      if (r > 0 && Math.abs(c - prev) < 2) continue;
      const g = region[r * N + c];
      if (usedRegion[g]) continue;
      usedCol[c] = true; usedRegion[g] = true;
      go(r + 1, c);
      usedCol[c] = false; usedRegion[g] = false;
      if (found >= limit) return;
    }
  };

  go(0, -99);
  return found;
}

/** The first `limit` solutions themselves, as arrays of cell indices.
 */
function findSolutions(N, region, limit) {
  const usedCol = new Array(N).fill(false);
  const usedRegion = new Array(N).fill(false);
  const pick = new Array(N).fill(-1);
  const out = [];

  const go = (r, prev) => {
    if (r === N) { out.push(pick.map((c, row) => row * N + c)); return; }
    for (let c = 0; c < N; c++) {
      if (usedCol[c]) continue;
      if (r > 0 && Math.abs(c - prev) < 2) continue;
      const g = region[r * N + c];
      if (usedRegion[g]) continue;
      usedCol[c] = true; usedRegion[g] = true; pick[r] = c;
      go(r + 1, c);
      usedCol[c] = false; usedRegion[g] = false; pick[r] = -1;
      if (out.length >= limit) return;
    }
  };

  go(0, -99);
  return out;
}

/** Is region `g` still one connected blob if `drop` leaves it? */
function stillWhole(N, region, g, drop) {
  const cells = [];
  for (let i = 0; i < N * N; i++) if (region[i] === g && i !== drop) cells.push(i);
  if (!cells.length) return false;
  const inRegion = new Set(cells);
  const seen = new Set([cells[0]]);
  const queue = [cells[0]];
  while (queue.length) {
    for (const n of neighbours4(queue.pop(), N)) {
      if (inRegion.has(n) && !seen.has(n)) { seen.add(n); queue.push(n); }
    }
  }
  return seen.size === cells.length;
}

/** Nudge the region walls until the yard has exactly one answer.
 *
 *  Growing regions at random almost never lands on a unique puzzle once the
 *  board gets past 5×5, so rather than rejecting and re-rolling, we repair.
 *  Take a square that rival answers rely on and the real answer never uses,
 *  and hand it to a neighbouring region: every rival that stood on it now
 *  has two pups in one region and dies, while the real answer — which never
 *  touched that square — comes through untouched.
 *
 *  Squares are tried most-used-by-rivals first, so each move kills as many
 *  rivals as it can. */
function repairRegions(N, region, solution, rand) {
  const answer = new Set(solution);
  const SAMPLE = 16;
  const perRound = Math.max(2, N);   // several walls per pass, or a big
                                          // board never converges in time

  for (let round = 0; round < 90; round++) {
    const sols = findSolutions(N, region, SAMPLE);
    if (sols.length < 2) return sols.length === 1 ? region : null;

    const uses = new Map();
    for (const rival of sols) {
      for (const i of rival) if (!answer.has(i)) uses.set(i, (uses.get(i) || 0) + 1);
    }
    if (!uses.size) return null;

    const size = new Array(N).fill(0);
    for (const g of region) size[g]++;

    const order = shuffle([...uses.keys()], rand)
      .sort((a, b) => uses.get(b) - uses.get(a));

    let moved = 0;
    for (const x of order) {
      if (moved >= perRound) break;
      const from = region[x];
      // Never shrink a yard below two squares: a one-square yard hands the
      // player a pup for free and makes the whole board cheaper.
      if (size[from] < 3 || !stillWhole(N, region, from, x)) continue;
      const options = shuffle([...new Set(
        neighbours4(x, N).map((n) => region[n]).filter((g) => g !== from)
      )], rand);
      if (!options.length) continue;
      region[x] = options[0];
      size[from]--;
      size[options[0]]++;
      moved++;
    }
    if (!moved) return null;
  }
  return null;
}

/* ---------- the logical solver -----------------------------------------
   Everything a player would actually reason with, in three tiers.  The tier
   a puzzle needs is its difficulty rating, and the same routine hands out
   hints during play — so a hint is always a deduction the player could have
   made, never a peek at the answer. */

function buildUnits(N, region) {
  const units = [];
  for (let r = 0; r < N; r++) {
    units.push({ kind: "row", n: r, cells: Array.from({ length: N }, (_, c) => r * N + c) });
  }
  for (let c = 0; c < N; c++) {
    units.push({ kind: "column", n: c, cells: Array.from({ length: N }, (_, r) => r * N + c) });
  }
  const byRegion = Array.from({ length: N }, () => []);
  for (let i = 0; i < N * N; i++) byRegion[region[i]].push(i);
  byRegion.forEach((cells, g) => units.push({ kind: "region", n: g, cells }));
  return units;
}

const unitName = (u, names) =>
  u.kind === "region" ? `the ${names ? names[u.n] : "#" + (u.n + 1)} yard`
    : `${u.kind} ${u.n + 1}`;

/** Find one thing that follows from the board as it stands.
 *  Returns {kind, cells, tier, reason} or null when nothing more can be
 *  deduced, or {kind:"stuck"} when the board contradicts itself. */
function nextStep(N, region, cell, units, maxTier, names) {
  const open = units.filter((u) => !u.cells.some((i) => cell[i] === PUP));
  const cands = new Map();
  for (const u of open) {
    const list = u.cells.filter((i) => cell[i] === UNKNOWN);
    if (!list.length) return { kind: "stuck", unit: u };
    cands.set(u, list);
  }

  // Tier 1 — a row, column or region with one square left.
  for (const u of open) {
    const list = cands.get(u);
    if (list.length === 1) {
      return {
        kind: "pup", cells: list, tier: 1,
        reason: `${unitName(u, names)} has only one square left, so a pup goes there.`,
      };
    }
  }
  if (maxTier < 2) return null;

  // Tier 2 — a region penned into one line rules that line out elsewhere,
  // and a line penned into one region rules that region out elsewhere.
  for (const u of open) {
    const list = cands.get(u);
    const rows = new Set(list.map((i) => (i / N) | 0));
    const cols = new Set(list.map((i) => i % N));
    const regs = new Set(list.map((i) => region[i]));

    if (u.kind === "region" && rows.size === 1) {
      const r = [...rows][0];
      const hit = [];
      for (let c = 0; c < N; c++) {
        const i = r * N + c;
        if (region[i] !== u.n && cell[i] === UNKNOWN) hit.push(i);
      }
      if (hit.length) {
        return {
          kind: "nope", cells: hit, tier: 2,
          reason: `Every square left in ${unitName(u, names)} sits in row ${r + 1}, so row ${r + 1}'s pup must be one of them.`,
        };
      }
    }
    if (u.kind === "region" && cols.size === 1) {
      const c = [...cols][0];
      const hit = [];
      for (let r = 0; r < N; r++) {
        const i = r * N + c;
        if (region[i] !== u.n && cell[i] === UNKNOWN) hit.push(i);
      }
      if (hit.length) {
        return {
          kind: "nope", cells: hit, tier: 2,
          reason: `Every square left in ${unitName(u, names)} sits in column ${c + 1}, so column ${c + 1}'s pup must be one of them.`,
        };
      }
    }
    if (u.kind !== "region" && regs.size === 1) {
      const g = [...regs][0];
      const inUnit = new Set(list);
      const hit = [];
      for (let i = 0; i < N * N; i++) {
        if (region[i] === g && cell[i] === UNKNOWN && !inUnit.has(i)) hit.push(i);
      }
      if (hit.length) {
        return {
          kind: "nope", cells: hit, tier: 2,
          reason: `${unitName(u, names)} can only be served by ${unitName({ kind: "region", n: g }, names)}, so the rest of that yard is out.`,
        };
      }
    }
  }
  if (maxTier < 3) return null;

  // Tier 3 — try a square and see whether it strands some row, column or
  // region with nowhere left to go.
  for (let i = 0; i < N * N; i++) {
    if (cell[i] !== UNKNOWN) continue;
    const r = (i / N) | 0, c = i % N, g = region[i];
    const blocked = new Set(neighbours8(i, N));
    blocked.add(i);

    for (const u of open) {
      if (u.kind === "row" && u.n === r) continue;
      if (u.kind === "column" && u.n === c) continue;
      if (u.kind === "region" && u.n === g) continue;
      const alive = cands.get(u).some((j) => {
        if (blocked.has(j)) return false;
        return ((j / N) | 0) !== r && j % N !== c && region[j] !== g;
      });
      if (!alive) {
        return {
          kind: "nope", cells: [i], tier: 3,
          reason: `A pup here would leave ${unitName(u, names)} with nowhere to go.`,
        };
      }
    }
  }

  return null;
}

/** Write a deduction onto the board. */
function applyStep(N, region, cell, step) {
  if (step.kind === "wrong") {
    for (const i of step.cells) cell[i] = UNKNOWN;
    return;
  }
  if (step.kind === "nope") {
    for (const i of step.cells) cell[i] = NOPE;
    return;
  }
  const i = step.cells[0];
  cell[i] = PUP;
  const r = (i / N) | 0, c = i % N, g = region[i];
  for (let j = 0; j < N * N; j++) {
    if (j === i || cell[j] !== UNKNOWN) continue;
    if (((j / N) | 0) === r || j % N === c || region[j] === g) cell[j] = NOPE;
  }
  for (const j of neighbours8(i, N)) if (cell[j] === UNKNOWN) cell[j] = NOPE;
}

/** How hard the solve was.  Tiers 1 and 2 are the bread-and-butter moves
 *  every solver makes; what separates an easy yard from a mean one is how
 *  often you have to try a square and watch it strand something (tier 3).
 *  An empty board offers no tier-1 move at all, so counting tier-3 work is
 *  the rating that actually tracks how a puzzle feels. */
function rate(used, N) {
  if (!used[3]) return 1;
  return used[3] <= Math.max(2, Math.round(N / 3)) ? 2 : 3;
}

/** Solve as far as logic alone goes. */
function logicSolve(N, region, maxTier, start) {
  const cell = start ? start.slice() : new Array(N * N).fill(UNKNOWN);
  const units = buildUnits(N, region);
  const used = { 1: 0, 2: 0, 3: 0 };
  let guard = N * N * 12;

  while (guard-- > 0) {
    const step = nextStep(N, region, cell, units, maxTier);
    if (!step) break;
    if (step.kind === "stuck") return { solved: false, stuck: true, tier: 3, used, cell };
    used[step.tier]++;
    applyStep(N, region, cell, step);
  }

  const placed = cell.filter((v) => v === PUP).length;
  return { solved: placed === N, tier: rate(used, N), used, cell };
}

/* ---------- putting a puzzle together ----------------------------------- */

/** Build one yard from a seed.  Returns null if this seed produced nothing
 *  usable, which is normal — the caller just tries the next one. */
function buildPuzzle(N, seed) {
  const rand = mulberry32(seed);

  for (let attempt = 0; attempt < 16; attempt++) {
    const cols = placePups(N, rand);
    if (!cols) return null;
    const solution = cols.map((c, r) => r * N + c);
    let region = growRegions(N, solution, rand);
    if (!region) continue;
    region = repairRegions(N, region, solution, rand);
    if (!region) continue;

    const logic = logicSolve(N, region, 3);
    if (!logic.solved) continue;   // needs guesswork — not a fair puzzle

    return { N, region, solution, tier: logic.tier };
  }
  return null;
}

/* ---------- the level ladder --------------------------------------------
   The yard grows as you go, and difficulty resets with each new size so a
   bigger board always opens gently. */

const CHAPTERS = [
  { size: 4,  from: 1,   to: 3 },
  { size: 5,  from: 4,   to: 8 },
  { size: 6,  from: 9,   to: 15 },
  { size: 7,  from: 16,  to: 25 },
  { size: 8,  from: 26,  to: 60 },
  { size: 9,  from: 61,  to: 110 },
  { size: 10, from: 111, to: 160 },
  { size: 11, from: 161, to: 200 },
];

const LAST_LEVEL = CHAPTERS[CHAPTERS.length - 1].to;
const TIER_NAME = { 1: "Easy", 2: "Medium", 3: "Hard" };

function chapterOf(level) {
  return CHAPTERS.find((ch) => level >= ch.from && level <= ch.to) || CHAPTERS[CHAPTERS.length - 1];
}

/** What this level should look like: how big, and how hard we aim for. */
function levelPlan(level) {
  const ch = chapterOf(level);
  const span = ch.to - ch.from + 1;
  const at = level - ch.from;
  const want = span === 1 ? 1 : Math.min(3, 1 + Math.floor((at * 3) / span));
  return { size: ch.size, tier: want, chapter: ch };
}

/** A one-off puzzle for free play, at whatever size and rating is asked.
 *  Hunting for an exact rating can take a while on the bigger boards, so the
 *  search is capped by the clock and settles for the closest it found. */
function randomPuzzle(size, tier, rand, budgetMs) {
  const pick = rand || Math.random;
  const deadline = Date.now() + (budgetMs || 1500);
  let fallback = null;

  for (let n = 0; n < 60; n++) {
    const puzzle = buildPuzzle(size, (pick() * 0xffffffff) >>> 0);
    if (puzzle) {
      if (puzzle.tier === tier) return puzzle;
      if (!fallback || Math.abs(puzzle.tier - tier) < Math.abs(fallback.tier - tier)) fallback = puzzle;
    }
    if (fallback && Date.now() > deadline) break;
  }
  return fallback;
}

/** Read the level pack: one line per level, base-36 characters holding the
 *  size, the rating, a column per row of the answer, and a region per
 *  square. */
function decodePack(text) {
  const out = [];
  for (const line of text.trim().split("\n")) {
    if (!line) continue;
    const N = parseInt(line[0], 36);
    const tier = parseInt(line[1], 36);
    const solution = [];
    for (let r = 0; r < N; r++) solution.push(r * N + parseInt(line[2 + r], 36));
    const region = [];
    for (let k = 0; k < N * N; k++) region.push(parseInt(line[2 + N + k], 36));
    out.push({ N, tier, region, solution, level: out.length + 1 });
  }
  return out;
}

/* ---------- checking a player's board ----------------------------------- */

/** Every rule the board is currently breaking, as a set of cell indices. */
function conflicts(N, region, cell) {
  const bad = new Set();
  const pups = [];
  for (let i = 0; i < N * N; i++) if (cell[i] === PUP) pups.push(i);

  const seen = { row: new Map(), column: new Map(), region: new Map() };
  for (const i of pups) {
    const keys = { row: (i / N) | 0, column: i % N, region: region[i] };
    for (const k of Object.keys(seen)) {
      const at = seen[k].get(keys[k]);
      if (at !== undefined) { bad.add(i); bad.add(at); }
      else seen[k].set(keys[k], i);
    }
    for (const j of neighbours8(i, N)) if (cell[j] === PUP) { bad.add(i); bad.add(j); }
  }
  return bad;
}

/** A hint the player could have reasoned out themselves.
 *
 *  Any pup already in the wrong place is called out first — reasoning from a
 *  broken board would only dig the hole deeper.  Otherwise the deduction is
 *  rebuilt from the pups that are definitely right, so it stays sound no
 *  matter what the player has pencilled in, and then walked forward past
 *  every conclusion they have already reached.  Ask twice and you get two
 *  different hints, not the same one again. */
function hintFor(N, region, solution, cell, names) {
  const answer = new Set(solution);
  for (let i = 0; i < N * N; i++) {
    if (cell[i] === PUP && !answer.has(i)) {
      return { kind: "wrong", cells: [i], tier: 0, reason: "this pup can't be right — try lifting it." };
    }
  }

  const clean = new Array(N * N).fill(UNKNOWN);
  const units = buildUnits(N, region);
  for (let i = 0; i < N * N; i++) {
    if (cell[i] === PUP) applyStep(N, region, clean, { kind: "pup", cells: [i] });
  }

  for (let guard = 0; guard < N * N * 12; guard++) {
    let step = null;
    for (let tier = 1; tier <= 3 && !step; tier++) {
      const found = nextStep(N, region, clean, units, tier, names);
      if (found && found.kind !== "stuck") step = found;
    }
    if (!step) return null;

    if (step.kind === "pup") return step;                 // never already known
    const fresh = step.cells.filter((i) => cell[i] === UNKNOWN);
    if (fresh.length) return Object.assign({}, step, { cells: fresh });

    applyStep(N, region, clean, step);                    // the player has this one
  }
  return null;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    UNKNOWN, PUP, NOPE, CHAPTERS, LAST_LEVEL, TIER_NAME,
    mulberry32, neighbours8, neighbours4, placePups, growRegions,
    countSolutions, findSolutions, stillWhole, repairRegions,
    buildUnits, nextStep, applyStep, logicSolve,
    buildPuzzle, chapterOf, levelPlan, randomPuzzle, rate,
    conflicts, hintFor, decodePack,
  };
}
