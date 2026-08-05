# Hamsterdam

A card game played on foot by four people across Amsterdam and Utrecht, on 16,
18 and 20 August 2026. The app is the scorekeeper: shared coins, cards and
photos across four phones, used outdoors, in August, in sunlight.

**This is the demo build.** The real deck is not in this repository. See
[Why demo is a separate deployment](#why-demo-is-a-separate-deployment).

---

## What to do with it

`demo-site/` is a folder you drag onto Netlify. No repository, no build step, no
`npm install`. Its own [README.txt](demo-site/README.txt) carries the deploy
steps and the ten things to prove on the phones.

```
hamsterdam/
  demo-site/                      <-- drag this onto Netlify
    index.html
    content.js                    ALL content — the only file a content update touches
    engine.js                     rules; contains no card text
    net.js                        shared state across four phones, and photos
    app.js                        screens
    ledger.css                    the look
    netlify.toml
    netlify/functions/state.mjs   pre-bundled, zero dependencies (generated)
    README.txt

  function-src/                   not deployed — source for the function above
    state.mjs
    build.sh
    package.json
```

---

## Why demo is a separate deployment

The owner plays blind and cannot test with the real deck. The brief asks that
demo mode never be able to reveal real card text — not in a console log, not in
a network response, not in a cached payload — and offers a fallback: ship the
demo as its own deployment.

That fallback is what this is, because it is the only version of the rule that
is actually true. The real card text is not in this build, so there is no path
by which it can leak. The real deck ships later as its own folder and its own
Netlify site: identical app files, a different `content.js`.

The shared state function also never sees content. It stores an opaque
document and knows nothing about cards, coins or rules — all of that runs on
the phone.

---

## Content updates

Everything that is not logic lives in `demo-site/content.js`: cards, values,
card types, curses and their effects, whistle times, the conversion cutoff,
zone rules, day definitions, the draw order, standing mechanics, the clock
speed and the password.

A content update is a swap of that one file, then drag the folder onto Netlify
again. No code changes and no function rebuild.

The draw order is the `sequence` array on each day — an explicit list of cards
and curses, so curse density and position are authored rather than computed and
are identical for both teams. Deck sizes and the number of days are read from
those arrays. Nothing is hardcoded.

Two settings turn this build into the real one:

| Setting | Demo | Real |
|---|---|---|
| `clock.speedFactor` | `6` — one demo minute per ten real seconds | `1` |
| `clock.fixedStart` | `'12:00'` — a predictable ~35 minute day | `null` — the clock reads the real time of day, so opening earlier gives a longer day |
| `password` | `null` — no gate | a word — the gate is already built and dormant |

---

## Shared state

One function, `/api/state`, over Netlify Blobs.

- `GET` returns `{ version, state }` with an ETag; phones poll every 2.5s and
  send `If-None-Match`, so an unchanged poll costs a `304` and no body.
- `POST` sends `{ expectedVersion, state }`. If somebody wrote first it returns
  `409` with the current state, and the phone re-applies its intent to the
  fresh state and retries.
- Photos are stored as their own blob entries and the state document holds only
  ids, so the polled payload stays small. Images are downscaled to 1280px on
  the phone before upload.

The `409` is the point. Two phones on the same team both tapping *complete* on
the same card cannot clobber each other, and a phone that lost signal mid-curse
catches up by re-reading.

## Rebuilding the function

Only needed if `function-src/state.mjs` changes. Content changes do not need it.

```
cd function-src
npm install
./build.sh
```

`build.sh` bundles with esbuild and then **verifies** that no bare import
survives in the output, because a drag-and-drop deploy never runs
`npm install` and an unresolved import means a dead function in a street in
Amsterdam.

---

## Verification

Rules are unit-tested and the ten pass-list items are driven in headless
Chromium at iPhone size, with a separate browser context per phone so identity
and storage are genuinely separate, and the real function handler running
against a stubbed blob store. See the delivery notes for the run output.
