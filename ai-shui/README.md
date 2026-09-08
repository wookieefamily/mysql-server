# AI Shui 風水

Photograph a room; get it read against the bagua, the five elements, and the flow of qi.

A single self-contained `index.html` — no build step, no dependencies. Open it directly, or
publish it as a Claude Artifact so the camera and the live reading work.

## What it evaluates

The reading covers the parts of the practice that a single photograph can actually support:

- **Bagua map (八卦)** — a 3×3 overlay anchored to the *mouth of qi* (the room's main door),
  not to magnetic north, per Black-Sect practice. All nine guas are read: Career/Kan ☵,
  Knowledge/Gen ☶, Family/Zhen ☳, Wealth/Xun ☴, Fame/Li ☲, Love/Kun ☷, Creativity/Dui ☱,
  Helpful People/Qian ☰, and the Tai Qi centre ☯. Choosing a different door wall rotates the
  whole map, which is what changes the reading.
- **Five elements (五行 wu xing)** — wood, fire, earth, metal, water scored from the colours,
  materials and shapes present, and read through the productive and controlling cycles.
- **Yin/yang balance** — weighted against what the room is actually used for.
- **Commanding position** — bed, desk, stove or main seating: door visible, not in line with it,
  solid backing behind.
- **Qi flow** — pathways, straight rushing runs (door aligned with window or another door),
  and dead corners.
- **Sha qi (煞氣, poison arrows)** — exposed corners, columns, shelf edges aimed at a body.
- Overhead pressure from beams and soffits, clutter and under-bed storage, light and air,
  living plants and dead objects, mirrors, water features and colour temperature.

Output is a qi score, a verdict, per-gua findings, and cures ordered by leverage and tagged
by element and effort (quick / weekend / project).

Two things follow the cures:

- **Swap It Out** — where a piece is wrong in itself rather than merely badly placed (wrong
  scale, hard corners aimed at a body, a headboard with no backing, shelving above a head),
  the reading names what to buy instead, by the qualities that matter — height, corner
  profile, open vs closed, paired vs single — never by brand.
- **If Nothing Can Move** — the last resort for a rental, a shared room, or built-in
  furniture: clear the air instead. A real space-clearing protocol, with an honest note that
  white sage smudging is a Native American ceremonial practice rather than a Chinese one, and
  that feng shui's own kit is incense, bells, salt and an open window.

## How it works

The page asks the viewer's own Claude account to read the photo, via the artifact `sample`
capability with `images`. Nothing is sent until the viewer presses **Read this room**, and
the first call asks their permission. `downloads` is used only for **Save this reading**.

When the page runs somewhere that cannot reach Claude — opened as a plain local file, say —
the photo controls disable themselves and a fully worked example reading stays on screen, so
the output format is always visible.

## Design

Palette taken from the wu xing itself: jade (wood) as the primary accent, cinnabar (fire) for
the seal and warnings, clay (earth), old gold (metal), slate (water), over bamboo-pith paper
and ink. Zen Old Mincho for display, IBM Plex Sans for text, IBM Plex Mono for scores. The
element balance is drawn as five bamboo culms with node rings; a procedural bamboo grove is
drawn to canvas behind the page. Light and dark themes are both defined at token level.
