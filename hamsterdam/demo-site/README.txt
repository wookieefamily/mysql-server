HAMSTERDAM — DEMO
=================

This is the demo. The cards are household chores. It is not the game, and the
real deck is not in this folder, this deployment, or anywhere a browser can
reach from here.


WHAT IT IS FOR
--------------

A way to spend a day in a city seeing things you would not otherwise have seen,
eating things you would not otherwise have ordered, and talking to people you
would not otherwise have spoken to — with just enough competition to make you
actually do it.

It is not a race and it is not really about winning. Three things follow from
that, and they are built into the app:

  Nothing ever costs you time. No mechanic makes you stand still and wait.
  There is no prize for clearing the deck. Going deep on one card beats
    rushing through six.
  The score is out of sight until dinner. You are not carrying a scoreboard
    around Amsterdam.

What you ARE carrying is a record. Every card you finish takes a photo and a
line about what it actually was, and the day sheet becomes the thing you look
back at.


THE WHOLE GAME, IN FIVE SENTENCES
---------------------------------

You hold three cards. Do one and the next arrives.
Don't fancy one? Skip it — you get three skips a day and no more.
Some cards say BOTH TEAMS. Those get compared at dinner: the better one takes
the lot, the other takes a quarter.
One draw in six is a curse. Take the coins, then pay some back.
The whistle ends play. The numbers come out at dinner.

Cards marked ANYWHERE need no particular place — do them on a train, in a
queue, at a table. When you are stuck waiting, the app offers you one.


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


THE ELEVEN THINGS TO PROVE
--------------------------

 1. LOAD AND IDENTIFY
    All four phones open the URL. Each picks a different player.

 2. TEAMS
    Tap FLIP FOR DAYS ONE AND TWO. All four phones see the same result and it
    cannot be re-rolled. Day Three is fixed at Parents vs Kids.

    Four players make exactly three ways to split into two pairs, and Day Three
    takes one of them — so across the three days each of you partners each of
    the other three exactly once. The flip only decides which pairing comes
    first. Open "How the pairings work" to see all three days at once.

 3. DEAL, DO, SKIP
    Press START DAY. One card sits in front of you, the other two are one tap
    away underneath. DID IT completes it and the next arrives. SKIP passes on
    it — you have three a day, and when they are gone the button dies.

 4. A CURSE FIRES
    Keep going. A curse arrives on its own, printed white on black. It takes
    coins and then gives some back, and it never costs you a minute.

 5. BOTH TEAMS HOLD, THEN SETTLE
    Do a BOTH TEAMS card on both teams. In play it reads "to settle at dinner".
    Open DINNER: both claims sit side by side with the photos. Pick a winner.
    Winner takes the full value, the other takes a quarter.

 6. CAMERA AND A LINE
    Tap PHOTO. Your phone should open the CAMERA, not the photo library. Then
    finish a card and it asks you for one line about what it was. Both land on
    DAY SHEET, which is the record of the day rather than a column of coins.

 7. FOUR PHONES AGREE
    Change something on one phone. Within a couple of seconds the other three
    show the same coins, cards and photos.

 8. CLEARING THE DECK
    Clear an entire deck before the whistle. Play stops for that team. There is
    no bonus — it used to pay 1,500, which was a prize for rushing.

 9. THE WHISTLE
    Let the clock reach the whistle. Play ends and dinner is what is left.

10. START OVER
    At the foot of DAY SHEET, "Start this day over" clears today for all four
    phones. Confirm it works, because it is your way out of anything.

11. REDEPLOY MID-GAME
    Start a day, do a few cards, then drag the folder onto Netlify again while
    the day is running and reload all four phones. Play should continue with
    the score, cards and photos intact. This is the one that matters most: it
    is what every future update to the app actually does.

The demo clock runs at one demo minute per ten real seconds, so a full day
plays through in about half an hour.


READING A CARD
--------------

  No. 4 of 14      where you are in the deck
  Coloured band    BOTH TEAMS (black) or JUST DO IT (green). THE BIG ONE in
                   ochre means it is worth a lot and will eat an afternoon
  The big number   what it is worth TO YOU right now — halved if a curse has
                   halved it, not the number originally printed
  The green line   what the card means, in a sentence
  WIN / LOSE       on a contested card, what each outcome pays

The black NOW bar always says the single most useful thing: what a curse has
done to you, how many skips are left, or that the whistle has gone.

DAY SHEET is the record so far, stamped DONE, PENDING, WON, LOST or SKIPPED.


IF SOMETHING GOES WRONG
-----------------------

At the foot of DAY SHEET, shared with all four phones:

  Start this day over    clears today only, leaves the other days alone
  Clear everything       wipes all three days back to new

If a screen ever fails to draw, the app shows what went wrong with a RELOAD
button rather than freezing. Nothing is lost — the score lives on the server,
not on the phone.


CHANGING THE CARDS, OR THE RULES
--------------------------------

Everything is in content.js. Edit it, save, drag the folder onto Netlify again.
No code changes.

Near the top there is a `features` block. Rules that were cut for being more
work than fun are switched off there, not deleted:

  position           name a card, double or nothing
  standingMechanics  the four per-player counters
  findMy             300 a look, logged
  zones              opening zones that expire
  evidence           per-card tick lists
  attempts           limited tries on a card
  lateCurseConversion  curses drawn late costing coins instead of time
  liveScores         a running head-to-head total during the day
  notes              a line about each card (on by default)

Set one back to true and it returns. Nothing was thrown away.

EDITING WHILE A DAY IS RUNNING
Fixing a typo, a value or a card's wording is safe at any time — the day
carries on and nobody notices. What is not safe is changing WHICH cards are in
a day: adding one, removing one, reordering them, or renaming an id. The four
phones are holding positions in that deck, so after such a change the position
they hold no longer means what it did.

The app checks for this rather than trusting you. Each day records the deck it
was dealt from; if that no longer matches, play stops on a screen that says
"Deck changed" and offers to start the day over. It will not quietly deal you
somebody else's card.

So: edit text freely mid-day. Change the line-up between days, or start the day
over after you do.


WHAT IS IN HERE
---------------

  index.html    the shell
  content.js    ALL content and rules. The only file to edit.
  engine.js     the rules engine. No card text lives here.
  net.js        shared state across four phones, and photo upload.
  app.js        the screens.
  ledger.css    the look.
  netlify.toml  tells Netlify where the function is. Leave it alone.
  netlify/functions/state.mjs
                the shared store. Pre-bundled, zero dependencies. Generated —
                do not edit by hand.


NOTES
-----

Online only, by design. If a phone loses signal it says so and stops saving;
when signal returns it catches up by itself.

Two people on the same team both tapping DID IT on the same card is safe — the
second tap is recognised as the same action, not a second one.

No date locks, no device checks, no timezone logic. If you press start, it
starts.
