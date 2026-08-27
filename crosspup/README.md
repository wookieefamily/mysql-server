# Crosspup

A logic puzzle played with dogs. The yard is split into coloured patches, and
every row, every column and every patch gets exactly one pup — and no two pups
will sit next to each other, not even corner to corner.

Open `dist/index.html` in a browser. That single file is the whole game — no
server, no build step, no network. It works offline, on a phone, and remembers
where you got to.

## Playing

**Tap a square once** to cross it out — your note for "no pup here". **Tap
again** to put a pup down. A third tap clears it. Right-click or long-press
drops a pup straight in.

| | |
|---|---|
| **200 levels** | Yards grow from 4×4 to 11×11; each new size opens gently and works back up to Hard |
| **Free play** | A freshly dug yard at any size from 5×5 to 10×10, at the rating you pick |
| **Hints** | Always a step you could have worked out yourself, with the reasoning spelled out — never a peek at the answer |
| **Undo / Clear** | Take back one mark, or start the yard again |
| **Clashes** | Pups breaking a rule get ringed the moment they clash. Nobody loses |

Keyboard: arrows move, <kbd>Space</kbd> cycles, <kbd>X</kbd> crosses out,
<kbd>P</kbd> places a pup, <kbd>U</kbd> or <kbd>Ctrl-Z</kbd> undo,
<kbd>H</kbd> hint, <kbd>R</kbd> clear, <kbd>Esc</kbd> back.

Optional helpers in settings: cross out everything a pup rules out, light up
the row, column and yard under the cursor, sound, and dark mode (it follows
your system theme unless you say otherwise).

## Layout

```
assets/source-puppy.png  the original render, in its blue jumper
assets/pups/             twelve sprites derived from it, one per yard colour
src/engine.js            puzzle generation, solving, rating and hints
src/app.js               the game around it
src/style.css            styles
src/page.html            markup
src/levels.txt           the 200-level pack, ~19 KB of base-36
tools/make_pups.py       recolours the source puppy's jumper twelve ways
tools/make_levels.js     searches out the level pack
tools/build.py           inlines everything and writes dist/
tests/                   engine checks (node) and a browser playthrough
dist/index.html          ← play this
dist/artifact.html       the same page without the document skeleton
```

## How a yard is built

Every puzzle starts from its answer: one pup per row and column, none of them
touching — a permutation whose neighbouring entries differ by at least two.
Regions then grow outward from the pups, one region per pup, which is what
guarantees each region ends up holding exactly one.

Grown at random, those regions almost never give a puzzle with a *single*
answer once the board is past 5×5. So rather than re-rolling until one turns
up, `repairRegions` fixes what it has: it looks at the rival answers, finds a
square they lean on that the real answer never uses, and hands that square to
a neighbouring region. The rival now has two pups in one region and dies; the
real answer never touched that square, so it survives untouched. Repeat, most
used square first, until one answer is left standing.

Two details earn their keep. Regions are grown by reaching for the frontier
square with the *fewest* neighbours already in the region, so they come out
long and winding rather than blobby — which roughly halves the rival answers
to sift through. And no region is ever shrunk below two squares: a one-square
region hands the player a pup for free.

Difficulty is measured, not guessed. `logicSolve` solves each puzzle the way a
person would, in three tiers — a row, column or region down to one square; a
region penned into a single line (and the reverse); and trying a square to see
whether it strands something. An empty board offers no tier-one move at all,
so what actually separates an easy yard from a mean one is how much of that
last kind of work it takes: none is Easy, a little is Medium, a lot is Hard.
Any puzzle that can't be finished by those three tiers is thrown away, so no
level ever needs a guess.

The same routine powers hints, which is why a hint can tell you *why*.

## Building

```sh
python3 tools/make_pups.py assets/source-puppy.png assets/pups   # only if the art changes
node tools/make_levels.js                                        # ~4 minutes
python3 tools/build.py
```

`make_pups.py` needs Pillow. It finds the jumper by hue — the fur sits around
15–30°, the jumper around 190–215° — and rotates only those pixels, with a
soft weight at the boundary so the edges stay clean. Twelve dogs who are
unmistakably the same dog.

`make_levels.js` is the slow one, and deliberately so: hunting for a yard that
lands on an exact difficulty rating can take twenty seconds on an 11×11 board.
That's fine at build time and not fine on a player's phone, so the 200 levels
are solved for once and shipped as a compact string that the game just reads.
Level 47 is the same yard on every device.

## Tests

```sh
node tests/engine.test.js   # rules, generator, solver, hints, and the pack
node tests/ui.test.js       # browser playthrough; needs `npm i playwright`
```

The engine test checks the generator on fresh yards and then audits all 200
shipped levels: every answer obeys the rules, every level has exactly one
answer, every level is solvable by logic without a guess, and no level has a
one-square yard. The UI test plays a level through in a real browser — tap
cycling, right-click, clash flagging, undo, hints, winning, unlocking, and
progress surviving a reload.
