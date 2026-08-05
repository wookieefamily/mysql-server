HAMSTERDAM — DEMO
=================

This is the demo. The cards are household chores. It is not the game, and the
real deck is not in this folder, this deployment, or anywhere a browser can
reach from here.


HOW TO PUT IT ONLINE
--------------------

1. Go to app.netlify.com and sign in.
2. Choose "Add new site", then "Deploy manually".
3. Drag THIS FOLDER (the one holding this file) onto the drop area.
4. Wait for the URL. Rename the site to something you can type on a phone.
5. Open that URL on all four phones.

There is no build step, nothing to install, and no repository. The function in
netlify/functions/ is already bundled with esbuild and has zero dependencies,
which is the only way it can work on a drag-and-drop deploy — those never run
npm install.

Nothing else needs configuring. The shared store is created on first write.


THE TEN THINGS TO PROVE
-----------------------

Run these on the phones, in demo mode, before the trip. If they pass, the real
morning is just pressing start.

 1. LOAD AND IDENTIFY
    All four phones open the URL. Each picks a different player. The name
    sticks on that phone.

 2. TEAMS
    On the start screen, set Day One's pairing. Day Two fills in with the other
    pairing by itself. Day Three is fixed at Parents vs Kids and offers no
    choice. You cannot use a pairing twice or leave one unused.

 3. DEAL, COMPLETE, VETO, FREEZE
    Press START DAY. Three cards deal. Complete one and the next arrives. Veto
    one: you freeze for ten demo minutes — 100 real seconds on this clock — and
    the next card will not come until it clears.

 4. A CURSE FIRES
    Keep completing. A curse arrives on its own, printed white on black. It
    pays its coins and applies its penalty.

 5. THE POSITION
    Declare a card in hand as your Position. It locks for the day. Declared
    before your second completion it is a triple; after, a double. It will not
    let you name a card you have already completed.

 6. VERSUS HOLDS, THEN SETTLES
    Complete a VERSUS card on both teams. In play it reads "pending" — it
    cannot be settled in the street. Open Dinner: both claims sit side by side.
    Pick a winner. The winner takes the full value, the loser a quarter, or a
    third if it was the TIME SINK.

 7. CAMERA
    Tap PHOTO on a card. Your phone should open the CAMERA, not the photo
    library. Take one. It appears on the card, and on the other phones.

 8. FOUR PHONES AGREE
    Change something on one phone. Within a couple of seconds the other three
    show the same coins, the same cards and the same photos.

 9. CLEAN SWEEP
    Clear an entire deck before the whistle. Play stops for that team, the
    score banks, and 1,500 lands. Day Three is the quickest deck to clear.

10. THE WHISTLE
    Let the clock reach the whistle. Play ends, the controls go, and dinner is
    what is left.

The demo clock runs at one demo minute per ten real seconds, so a full day
plays through in about half an hour. Day Three is about 35 minutes; Day Two,
about 30.


CHANGING THE CARDS
------------------

Every card, value, curse, whistle time, zone rule and day definition is in
content.js. Nothing else contains any of it.

To change content: edit content.js, save, and drag the folder onto Netlify
again. That is the whole procedure. No code changes, and the function does not
need rebuilding.

The comments at the top of content.js explain the shape. The draw order,
including exactly where the curses sit, is the `sequence` array on each day.
Deck sizes and the number of days are read from those arrays — nothing is
hardcoded.


WHAT IS IN HERE
---------------

  index.html    the shell
  content.js    ALL content. The only file to edit for a content change.
  engine.js     the rules. No card text lives here.
  net.js        shared state across the four phones, and photo upload.
  app.js        the screens.
  ledger.css    the look.
  netlify.toml  tells Netlify where the function is. Leave it alone.
  netlify/functions/state.mjs
                the shared store. Pre-bundled, zero dependencies. Generated —
                do not edit it by hand.


NOTES
-----

Online only, by design. If a phone loses signal it says so and stops saving;
when signal returns it catches up by itself.

The four phones share one state. Two people on the same team both tapping
"complete" on the same card is safe — the second tap is recognised as the same
action, not a second one.

No date locks, no device checks, no timezone logic. If you press start, it
starts.
