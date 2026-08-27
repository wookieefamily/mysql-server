# Crosspup

A sudoku where the digits are dogs. Nine pups, nine jumpers — one of each in
every row, column and box.

<!-- the nine pups, left to right: blueberry, cherry, clover, honey, plum,
     bubblegum, mint, marshmallow, charcoal -->

Open `dist/index.html` in a browser. That single file is the whole game —
no server, no build step, no network. It works offline, on a phone, and
keeps your game if you close the tab.

## Playing

Tap a square, then tap a pup. Or pick a pup first and tap empty squares to
drop copies of it in — occupied squares never get overwritten by accident,
tapping one picks that pup up instead.

| | |
|---|---|
| **Boards** | 4×4 and 6×6 for a quick one, 9×9 for the real thing |
| **Levels** | Puppy, Good dog, Clever, Top dog — 42 clues down to 23 |
| **Notes** | Pencil in the maybes as coloured dots; they tidy themselves up as you place pups |
| **Hint** | Fetches one correct pup. Hinted rounds don't set a best time |
| **Oopses** | Wrong pups are flagged as they land, and counted. Nobody loses |

Keyboard: <kbd>1</kbd>–<kbd>9</kbd> place, arrows move, <kbd>N</kbd> notes,
<kbd>H</kbd> hint, <kbd>U</kbd> undo, <kbd>⌫</kbd> erase, <kbd>Esc</kbd>
clears the selection.

Nine dogs that differ only by jumper is a lot to ask of anyone's eyes, so
**Number badges** in settings stamps 1–9 on every pup. Highlighting,
mistake-flagging, note tidying, sound and dark mode are all switchable, and
the game follows your system theme unless you say otherwise.

## Layout

```
assets/source-puppy.png  the original render, in its blue jumper
assets/pups/       the nine sprites derived from it
src/index.html     the game: markup, styles, engine, UI
tools/make_pups.py recolours the source puppy's jumper nine ways
tools/build.py     inlines the sprites and writes dist/
tests/             engine checks (node) and a browser playthrough
dist/index.html    ← play this
dist/artifact.html same page without the document skeleton
```

## Building

```sh
python3 tools/make_pups.py assets/source-puppy.png assets/pups   # only if the art changes
python3 tools/build.py
```

`make_pups.py` needs Pillow. It finds the jumper by hue — the fur sits
around 15–30°, the jumper around 190–215° — and rotates only those pixels,
with a soft weight at the boundary so the edges stay clean. Seven hue
rotations plus a desaturated cream and a darkened charcoal give nine dogs
who are unmistakably the same dog.

## Tests

```sh
node tests/engine.test.js   # puzzle generation
node tests/ui.test.js       # browser playthrough; needs `npm i playwright`
```

The engine test pulls the generator straight out of `src/index.html`, so it
checks the code that actually ships: every solution is a legal grid, every
clue agrees with its answer, every puzzle has exactly one solution, and each
level hits its clue target quickly. Puzzles are carved from a random
completed grid by lifting rotationally symmetric pairs while the answer
stays unique, then single cells to reach the sparser levels.
