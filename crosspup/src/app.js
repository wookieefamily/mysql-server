/* ==========================================================================
   Crosspup — the game around the engine.
   ========================================================================== */

/* Sprite data URIs and the level pack, both injected by tools/build.py */
const PUP_SRC = [/*__PUP_SRC__*/];
const LEVEL_PACK = `/*__LEVELS__*/`;

/* Each yard on the board takes one of these colours, and the pup that lives
   there wears the matching jumper. */
const PALETTE = [
  { name: "Blueberry", l: "hsl(214 62% 88%)", d: "hsl(214 40% 26%)", sl: "hsl(214 55% 55%)", sd: "hsl(214 55% 62%)" },
  { name: "Cherry",    l: "hsl(2 68% 89%)",   d: "hsl(2 42% 27%)",   sl: "hsl(2 58% 56%)",   sd: "hsl(2 62% 65%)" },
  { name: "Clover",    l: "hsl(140 45% 86%)", d: "hsl(140 32% 22%)", sl: "hsl(140 42% 42%)", sd: "hsl(140 40% 55%)" },
  { name: "Honey",     l: "hsl(45 78% 85%)",  d: "hsl(45 45% 25%)",  sl: "hsl(42 62% 46%)",  sd: "hsl(45 60% 58%)" },
  { name: "Plum",      l: "hsl(282 45% 89%)", d: "hsl(282 32% 27%)", sl: "hsl(282 40% 57%)", sd: "hsl(282 45% 66%)" },
  { name: "Bubblegum", l: "hsl(330 70% 91%)", d: "hsl(330 40% 28%)", sl: "hsl(330 55% 62%)", sd: "hsl(330 58% 68%)" },
  { name: "Mint",      l: "hsl(168 48% 84%)", d: "hsl(168 34% 22%)", sl: "hsl(168 45% 40%)", sd: "hsl(168 42% 52%)" },
  { name: "Sky",       l: "hsl(196 72% 93%)", d: "hsl(196 42% 32%)", sl: "hsl(196 55% 55%)", sd: "hsl(196 55% 66%)" },
  { name: "Lime",      l: "hsl(92 50% 84%)",  d: "hsl(92 32% 22%)",  sl: "hsl(92 45% 40%)",  sd: "hsl(92 42% 52%)" },
  { name: "Indigo",    l: "hsl(250 45% 85%)", d: "hsl(250 38% 31%)", sl: "hsl(250 45% 60%)", sd: "hsl(250 50% 68%)" },
  { name: "Coral",     l: "hsl(14 78% 90%)",  d: "hsl(14 45% 29%)",  sl: "hsl(14 62% 58%)",  sd: "hsl(14 62% 66%)" },
  { name: "Slate",     l: "hsl(210 16% 87%)", d: "hsl(210 12% 27%)", sl: "hsl(210 14% 50%)", sd: "hsl(210 14% 60%)" },
];

const FREE_SIZES = [5, 6, 7, 8, 9, 10];
const STORE_KEY = "crosspup.v2";

const LEVELS = decodePack(LEVEL_PACK);
const REGION_NAMES = PALETTE.map((p) => p.name);

/* ---------- helpers ---------- */
const $ = (id) => document.getElementById(id);
const el = (tag, cls) => { const n = document.createElement(tag); if (cls) n.className = cls; return n; };
const fmtTime = (s) => `${(s / 60) | 0}:${String(s % 60).padStart(2, "0")}`;

/* ---------- saved state ---------- */
const store = {
  read() { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { return {}; } },
  write(patch) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(Object.assign(this.read(), patch))); }
    catch (e) { /* blocked storage — the game still plays, it just forgets */ }
  },
  clear() { try { localStorage.removeItem(STORE_KEY); } catch (e) {} },
};

const settings = Object.assign(
  { auto: false, flag: true, hl: true, sound: false, theme: "system" },
  store.read().settings || {}
);
let done = store.read().done || {};        // level number -> best seconds

/* ---------- sound ---------- */
let audio = null;
function blip(freqs, dur = 0.11, type = "sine", gain = 0.045) {
  if (!settings.sound) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === "suspended") audio.resume();
    freqs.forEach((f, i) => {
      const osc = audio.createOscillator(), vol = audio.createGain();
      const at = audio.currentTime + i * dur * 0.75;
      osc.type = type; osc.frequency.value = f;
      vol.gain.setValueAtTime(0, at);
      vol.gain.linearRampToValueAtTime(gain, at + 0.012);
      vol.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      osc.connect(vol).connect(audio.destination);
      osc.start(at); osc.stop(at + dur + 0.02);
    });
  } catch (e) { /* no audio here, no problem */ }
}

let toastNode = null;
function toast(msg) {
  if (toastNode) toastNode.remove();
  toastNode = el("div", "toast");
  toastNode.textContent = msg;
  document.body.appendChild(toastNode);
  const mine = toastNode;
  setTimeout(() => { if (mine === toastNode) toastNode = null; mine.remove(); }, 2700);
}

/* ==========================================================================
   Game state
   ========================================================================== */

let game = null;
let cells = [];
let clock = null;

function openPuzzle(puzzle) {
  game = {
    puzzle,
    N: puzzle.N,
    cell: new Array(puzzle.N * puzzle.N).fill(UNKNOWN),
    undo: [],
    sel: null,
    hints: 0, seconds: 0, done: false,
  };
  $("hintline").hidden = true;
  $("win").hidden = true;
  show("play");
  buildBoard();
  render();
}

/* ---------- board ---------- */

function buildBoard() {
  const { N, region } = game.puzzle;
  const board = $("board");
  board.style.gridTemplateColumns = `repeat(${N}, 1fr)`;
  board.style.gridTemplateRows = `repeat(${N}, 1fr)`;
  board.textContent = "";
  cells = [];

  for (let i = 0; i < N * N; i++) {
    const r = (i / N) | 0, c = i % N;
    const tint = PALETTE[region[i] % PALETTE.length];
    const cell = el("button", "cell");
    cell.type = "button";
    cell.dataset.i = i;
    cell.setAttribute("role", "gridcell");
    cell.style.setProperty("--tint-l", tint.l);
    cell.style.setProperty("--tint-d", tint.d);
    cell.style.setProperty("--seam-l", tint.sl);
    cell.style.setProperty("--seam-d", tint.sd);

    // Each square draws its own half of any wall it sits against, so the two
    // halves meet exactly on the boundary. Drawing the walls as part of the
    // squares — rather than as an overlay on top of them — is what keeps
    // them lined up at every board size.
    const g = region[i];
    if (r === 0 || region[i - N] !== g) cell.classList.add("w-t");
    if (c === N - 1 || region[i + 1] !== g) cell.classList.add("w-r");
    if (r === N - 1 || region[i + N] !== g) cell.classList.add("w-b");
    if (c === 0 || region[i - 1] !== g) cell.classList.add("w-l");

    const img = el("img");
    img.alt = "";
    img.hidden = true;
    img.src = PUP_SRC[region[i] % PUP_SRC.length];

    // An SVG element ignores the `hidden` attribute the way HTML honours it,
    // so the cross is shown and hidden with a class instead.
    const no = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    no.setAttribute("class", "no");
    no.setAttribute("viewBox", "0 0 20 20");
    for (const [x1, y1, x2, y2] of [[5, 5, 15, 15], [15, 5, 5, 15]]) {
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", x1); line.setAttribute("y1", y1);
      line.setAttribute("x2", x2); line.setAttribute("y2", y2);
      no.appendChild(line);
    }

    cell.append(img, no);
    board.appendChild(cell);
    cells.push({ cell, img, no, r, c, g: region[i] });
  }
}

function render() {
  const { N, region } = game.puzzle;
  const state = game.cell;
  const bad = settings.flag ? conflicts(N, region, state) : new Set();
  const sel = game.sel;

  let selRow = -1, selCol = -1, selRegion = -1;
  if (sel != null && settings.hl) {
    selRow = (sel / N) | 0; selCol = sel % N; selRegion = region[sel];
  }

  let placed = 0;
  for (let i = 0; i < N * N; i++) {
    const { cell, img, no, r, c, g } = cells[i];
    const v = state[i];
    if (v === PUP) placed++;

    img.hidden = v !== PUP;
    no.classList.toggle("on", v === NOPE);

    cell.classList.toggle("sel", i === sel);
    cell.classList.toggle("bad", bad.has(i));
    cell.classList.toggle("lit", settings.hl && i !== sel &&
      (r === selRow || c === selCol || g === selRegion));
    cell.setAttribute("tabindex", i === (sel ?? 0) ? "0" : "-1");

    const where = `row ${r + 1} column ${c + 1}, ${REGION_NAMES[g % 12]} yard`;
    cell.setAttribute("aria-label",
      v === PUP ? `${where}, pup` : v === NOPE ? `${where}, crossed out` : where);
  }

  $("tally-placed").textContent = placed;
  $("tally-total").textContent = N;
  $("tally-warn").innerHTML = bad.size ? `<span class="warn">${bad.size} pups clashing</span>` : "";
  $("t-undo").disabled = !game.undo.length;
  $("t-hint").disabled = game.done;
  $("clock").textContent = fmtTime(game.seconds);
}

/* ---------- moves ---------- */

function setCell(i, value, quiet) {
  if (game.done) return;
  game.undo.push(game.cell.slice());
  if (game.undo.length > 300) game.undo.shift();
  game.cell[i] = value;

  if (value === PUP && settings.auto) crossOutAround(i);
  if (!quiet) {
    if (value === PUP) blip([620], 0.09);
    else if (value === NOPE) blip([340], 0.06, "triangle", 0.03);
  }
  render();
  checkWin();
}

/** With the helper switched on, placing a pup crosses off everything it
 *  rules out — the whole row, the whole column, its yard and its neighbours. */
function crossOutAround(i) {
  const { N, region } = game.puzzle;
  const r = (i / N) | 0, c = i % N, g = region[i];
  for (let j = 0; j < N * N; j++) {
    if (j === i || game.cell[j] !== UNKNOWN) continue;
    if (((j / N) | 0) === r || j % N === c || region[j] === g) game.cell[j] = NOPE;
  }
  for (const j of neighbours8(i, N)) if (game.cell[j] === UNKNOWN) game.cell[j] = NOPE;
}

/** Tap once to cross out, again for a pup, again to clear — the way the
 *  genre plays everywhere. */
function cycle(i) {
  const at = game.cell[i];
  setCell(i, at === UNKNOWN ? NOPE : at === NOPE ? PUP : UNKNOWN);
}

function undo() {
  const prev = game.undo.pop();
  if (!prev) return;
  game.cell = prev;
  $("hintline").hidden = true;
  render();
}

function reset() {
  if (!game.cell.some((v) => v !== UNKNOWN)) return;
  game.undo.push(game.cell.slice());
  game.cell = new Array(game.N * game.N).fill(UNKNOWN);
  $("hintline").hidden = true;
  render();
  toast("Yard cleared");
}

function askHint() {
  const { N, region, solution } = game.puzzle;
  const step = hintFor(N, region, solution, game.cell, REGION_NAMES);
  const line = $("hintline");

  if (!step) {
    line.innerHTML = "<b>Nothing left to work out</b> — the yard is done.";
    line.hidden = false;
    return;
  }

  game.hints++;
  line.innerHTML = `<b>Hint.</b> ${step.reason[0].toUpperCase()}${step.reason.slice(1)}`;
  line.hidden = false;
  blip([500, 700], 0.1);

  for (const i of step.cells) {
    cells[i].cell.classList.add("tip");
    setTimeout(() => cells[i].cell.classList.remove("tip"), 3400);
  }
  cells[step.cells[0]].cell.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function checkWin() {
  if (game.done) return;
  const { N, region, solution } = game.puzzle;
  const placed = [];
  for (let i = 0; i < N * N; i++) if (game.cell[i] === PUP) placed.push(i);
  if (placed.length !== N) return;
  if (conflicts(N, region, game.cell).size) return;
  if (!placed.every((i) => solution.includes(i))) return;

  game.done = true;
  render();

  const level = game.puzzle.level;
  let best = null, beatIt = false;
  if (level) {
    const previous = done[level];
    beatIt = previous != null && game.seconds < previous;   // a first solve is not a "best"
    if (previous == null || beatIt) { done[level] = game.seconds; store.write({ done }); }
    best = done[level];
  }

  $("win-time").textContent = fmtTime(game.seconds);
  $("win-best").textContent = best == null ? "—" : fmtTime(best);
  $("win-hints").textContent = game.hints;
  $("win-pup").src = PUP_SRC[region[placed[0]] % PUP_SRC.length];
  $("win-sub").innerHTML = beatIt
    ? `<span class="best-flag">New best time!</span> Every pup found its yard.`
    : game.hints === 0
      ? "Not a single hint. Every pup found its yard."
      : "Every pup found its yard.";
  $("win-next").textContent =
    !level ? "Another yard" : level < LEVELS.length ? `Level ${level + 1}` : "Back to levels";
  $("win").hidden = false;
  $("win-next").focus();
  blip([523, 659, 784, 1047], 0.16, "sine", 0.05);
  rain();
  renderLevels();
}

function rain() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  for (let n = 0; n < 22; n++) {
    const img = el("img", "fall");
    img.src = PUP_SRC[(Math.random() * PUP_SRC.length) | 0];
    img.alt = "";
    img.style.left = `${Math.random() * 96}vw`;
    img.style.setProperty("--spin", `${(Math.random() * 900 - 450) | 0}deg`);
    img.style.animation = `fall ${2.6 + Math.random() * 2.2}s linear ${Math.random() * 1.1}s forwards`;
    document.body.appendChild(img);
    setTimeout(() => img.remove(), 7000);
  }
}

/* ==========================================================================
   Input
   ========================================================================== */

const board = $("board");

board.addEventListener("click", (e) => {
  const cell = e.target.closest(".cell");
  if (!cell || !game || game.done) return;
  const i = +cell.dataset.i;
  game.sel = i;
  cycle(i);
  cell.focus({ preventScroll: true });
});

board.addEventListener("contextmenu", (e) => {
  const cell = e.target.closest(".cell");
  if (!cell || !game || game.done) return;
  e.preventDefault();
  const i = +cell.dataset.i;
  game.sel = i;
  setCell(i, game.cell[i] === PUP ? UNKNOWN : PUP);
});

let holdTimer = null;
board.addEventListener("pointerdown", (e) => {
  const cell = e.target.closest(".cell");
  if (!cell || !game || game.done || e.pointerType === "mouse") return;
  const i = +cell.dataset.i;
  holdTimer = setTimeout(() => {
    holdTimer = null;
    game.sel = i;
    setCell(i, game.cell[i] === PUP ? UNKNOWN : PUP);
    if (navigator.vibrate) navigator.vibrate(12);
    cell.dataset.held = "1";
  }, 420);
});
for (const evt of ["pointerup", "pointercancel", "pointerleave"]) {
  board.addEventListener(evt, () => { clearTimeout(holdTimer); holdTimer = null; });
}
board.addEventListener("click", (e) => {
  const cell = e.target.closest(".cell");
  if (cell && cell.dataset.held) { delete cell.dataset.held; e.stopPropagation(); }
}, true);

document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.altKey) return;

  if (!$("win").hidden) {
    if (e.key === "Enter") { e.preventDefault(); $("win-next").click(); }
    if (e.key === "Escape") { e.preventDefault(); $("win-home").click(); }
    return;
  }
  if ($("screen-play").hidden || !game) return;

  const N = game.N;
  const key = e.key.toLowerCase();

  if (e.ctrlKey) {
    if (key === "z") { e.preventDefault(); undo(); }
    return;
  }

  if (e.key.startsWith("Arrow")) {
    e.preventDefault();
    const cur = game.sel ?? 0;
    let r = (cur / N) | 0, c = cur % N;
    if (game.sel != null) {
      if (e.key === "ArrowUp") r = (r + N - 1) % N;
      else if (e.key === "ArrowDown") r = (r + 1) % N;
      else if (e.key === "ArrowLeft") c = (c + N - 1) % N;
      else if (e.key === "ArrowRight") c = (c + 1) % N;
    }
    game.sel = r * N + c;
    render();
    cells[game.sel].cell.focus({ preventScroll: true });
    return;
  }

  const acts = e.key === " " || e.key === "Enter" || key === "x" || key === "p";
  if (game.sel == null && acts) { game.sel = 0; render(); }

  if (e.key === " " || e.key === "Enter") { e.preventDefault(); cycle(game.sel); }
  else if (key === "x") { e.preventDefault(); setCell(game.sel, game.cell[game.sel] === NOPE ? UNKNOWN : NOPE); }
  else if (key === "p") { e.preventDefault(); setCell(game.sel, game.cell[game.sel] === PUP ? UNKNOWN : PUP); }
  else if (key === "u") { e.preventDefault(); undo(); }
  else if (key === "h") { e.preventDefault(); askHint(); }
  else if (key === "r") { e.preventDefault(); reset(); }
  else if (e.key === "Escape") { e.preventDefault(); show("home"); }
});

$("t-undo").addEventListener("click", undo);
$("t-hint").addEventListener("click", askHint);
$("t-reset").addEventListener("click", reset);
$("btn-back").addEventListener("click", () => show("home"));

/* ==========================================================================
   Screens
   ========================================================================== */

function show(which) {
  $("screen-home").hidden = which !== "home";
  $("screen-play").hidden = which !== "play";
  $("busy").hidden = true;
  if (which === "home") {
    game = null;
    renderLevels();
    window.scrollTo({ top: 0 });
  }
}

function busy(text) {
  $("screen-home").hidden = true;
  $("screen-play").hidden = true;
  $("busy-text").textContent = text;
  $("busy").hidden = false;
}

/* ---------- level list ---------- */

function renderLevels() {
  const wrap = $("chapters");
  const solved = Object.keys(done).length;
  const next = nextLevel();

  $("done-count").textContent = solved;
  $("done-bar").style.width = `${(solved / LEVELS.length) * 100}%`;

  wrap.textContent = "";
  for (const ch of CHAPTERS) {
    const box = el("div", "chapter");
    const head = el("h2");
    head.append(
      document.createTextNode(`${ch.size}×${ch.size} yards`),
      Object.assign(el("em"), { textContent: `levels ${ch.from}–${ch.to}` })
    );

    // A chapter nobody can reach yet collapses to one line — 200 greyed-out
    // tiles is a lot of page to scroll past.
    if (ch.from > next) {
      const note = el("p", "locked-note");
      note.textContent = `Opens when you finish level ${ch.from - 1}`;
      box.append(head, note);
      wrap.appendChild(box);
      continue;
    }

    const grid = el("div", "levels");

    for (let n = ch.from; n <= ch.to && n <= LEVELS.length; n++) {
      const b = el("button", "lv");
      b.type = "button";
      b.textContent = n;
      const locked = n > next;
      if (done[n] != null) {
        b.classList.add("done");
        const t = el("small"); t.textContent = fmtTime(done[n]);
        b.appendChild(t);
      } else if (n === next) {
        b.classList.add("next");
      }
      if (locked) {
        b.classList.add("locked");
        b.disabled = true;
        b.setAttribute("aria-label", `Level ${n}, locked`);
      } else {
        b.setAttribute("aria-label",
          `Level ${n}${done[n] != null ? `, solved in ${fmtTime(done[n])}` : ""}`);
        b.addEventListener("click", () => playLevel(n));
      }
      grid.appendChild(b);
    }
    box.append(head, grid);
    wrap.appendChild(box);
  }
}

/** The furthest level open to the player: everything solved, plus one. */
function nextLevel() {
  let n = 1;
  while (n <= LEVELS.length && done[n] != null) n++;
  return n;
}

function playLevel(n) {
  const puzzle = LEVELS[n - 1];
  if (!puzzle) return;
  $("play-title").textContent = `Level ${n}`;
  $("play-sub").textContent = `${puzzle.N}×${puzzle.N} · ${TIER_NAME[puzzle.tier]}`;
  openPuzzle(puzzle);
}

/* ---------- free play ---------- */

let freeSize = 7, freeTier = 2;

function buildFreeControls() {
  const sizes = $("free-size");
  sizes.textContent = "";
  for (const n of FREE_SIZES) {
    const b = el("button", "chip");
    b.type = "button";
    b.textContent = `${n}×${n}`;
    b.setAttribute("aria-pressed", String(n === freeSize));
    b.addEventListener("click", () => { freeSize = n; buildFreeControls(); });
    sizes.appendChild(b);
  }
  const tiers = $("free-tier");
  tiers.textContent = "";
  for (const t of [1, 2, 3]) {
    const b = el("button", "chip");
    b.type = "button";
    b.textContent = TIER_NAME[t];
    b.setAttribute("aria-pressed", String(t === freeTier));
    b.addEventListener("click", () => { freeTier = t; buildFreeControls(); });
    tiers.appendChild(b);
  }
}

$("btn-free-go").addEventListener("click", () => {
  busy("Digging up a fresh yard…");
  // Two frames, so the digging pup is actually on screen before the
  // generator takes the thread.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const puzzle = randomPuzzle(freeSize, freeTier);
    if (!puzzle) { show("home"); toast("That one got away — try again"); return; }
    $("play-title").textContent = "Free play";
    $("play-sub").textContent = `${puzzle.N}×${puzzle.N} · ${TIER_NAME[puzzle.tier]}`;
    openPuzzle(puzzle);
  }));
});

for (const tab of ["tab-levels", "tab-free"]) {
  $(tab).addEventListener("click", () => {
    const levels = tab === "tab-levels";
    $("tab-levels").setAttribute("aria-pressed", String(levels));
    $("tab-free").setAttribute("aria-pressed", String(!levels));
    $("view-levels").hidden = !levels;
    $("view-free").hidden = levels;
  });
}

/* ---------- win buttons ---------- */

$("win-next").addEventListener("click", () => {
  $("win").hidden = true;
  const level = game && game.puzzle.level;
  if (level && level < LEVELS.length) playLevel(level + 1);
  else if (level) show("home");
  else $("btn-free-go").click();
});
$("win-home").addEventListener("click", () => { $("win").hidden = true; show("home"); });

/* ==========================================================================
   Panels, settings, clock, boot
   ========================================================================== */

function panelToggle(btnId, panelId) {
  const btn = $(btnId), panel = $(panelId);
  btn.addEventListener("click", () => {
    const open = panel.hidden;
    for (const [b, p] of [["btn-help", "panel-help"], ["btn-settings", "panel-settings"]]) {
      $(p).hidden = true;
      $(b).setAttribute("aria-pressed", "false");
    }
    panel.hidden = !open;
    btn.setAttribute("aria-pressed", String(open));
  });
}
panelToggle("btn-help", "panel-help");
panelToggle("btn-settings", "panel-settings");

function applyTheme() {
  const root = document.documentElement;
  if (settings.theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", settings.theme);
}

function bindSwitch(id, key, after) {
  const sw = $(id);
  const paint = () => sw.setAttribute("aria-pressed", String(!!settings[key]));
  paint();
  sw.addEventListener("click", () => {
    settings[key] = !settings[key];
    paint();
    store.write({ settings });
    if (after) after();
  });
}

bindSwitch("set-auto", "auto");
bindSwitch("set-flag", "flag", () => game && render());
bindSwitch("set-hl", "hl", () => game && render());
bindSwitch("set-sound", "sound", () => { if (settings.sound) blip([660], 0.09); });

const darkSw = $("set-dark");
const paintDark = () => darkSw.setAttribute("aria-pressed", String(settings.theme === "dark"));
darkSw.addEventListener("click", () => {
  settings.theme = settings.theme === "dark" ? "light" : "dark";
  paintDark();
  applyTheme();
  store.write({ settings });
});

$("btn-wipe").addEventListener("click", () => {
  store.clear();
  done = {};
  renderLevels();
  toast("Back to level one");
});

clock = setInterval(() => {
  if (!game || game.done || document.hidden || $("screen-play").hidden) return;
  game.seconds++;
  $("clock").textContent = fmtTime(game.seconds);
}, 1000);

/* ---------- boot ---------- */
// First time here, the rules are the thing to see, not a wall of tiles.
if (!store.read().seen) {
  $("panel-help").hidden = false;
  $("btn-help").setAttribute("aria-pressed", "true");
  store.write({ seen: true });
}

$("mascot").src = PUP_SRC[0];
$("busy-pup").src = PUP_SRC[3];
paintDark();
applyTheme();
buildFreeControls();
renderLevels();
show("home");
