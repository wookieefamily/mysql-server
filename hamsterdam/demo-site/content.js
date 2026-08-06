// ===========================================================================
// HAMSTERDAM — CONTENT
// ===========================================================================
//
// THIS IS THE ONLY FILE THAT HOLDS CONTENT. Every card, value, curse, whistle
// time, zone rule and day definition is here. Nothing in this file is logic and
// no logic anywhere else contains content. A content update is a swap of this
// one file — no code changes, no redeploy of the function.
//
// ---------------------------------------------------------------------------
// THIS BUILD IS THE DEMO. THE CARDS ARE HOUSEHOLD CHORES AND ARE NOT THE GAME.
// The real deck is not in this file, this folder, or this deployment.
// ---------------------------------------------------------------------------
//
// To swap content:
//   1. Keep the shape below. Every key is read by name.
//   2. `sequence` is the draw order, authored explicitly. Curses sit at fixed
//      positions in it, which is what makes curse density identical for both
//      teams. Deck size and day count are read from these arrays — nothing is
//      hardcoded in the app.
//   3. Save. Drag the folder onto Netlify again. Done.

export const content = {
  // -- Identity -------------------------------------------------------------
  build: 'DEMO',
  siteTitle: 'HAMSTERDAM — DEMO',
  banner: 'DEMO · HOUSEHOLD CHORES · NOT THE REAL GAME',

  // -- What is switched on ---------------------------------------------------
  // The game got complicated because every rule was clever on its own. These
  // turn whole rules off. Anything false here is not just hidden — it is not
  // scored, not shown, and not something anybody has to remember.
  //
  // Flip one back to true and it returns, so nothing is lost by simplifying.
  features: {
    position: false,           // name a card, double or nothing
    standingMechanics: false,  // the four per-player counters
    findMy: false,             // 300 a look, logged
    zones: false,              // opening zones that expire
    evidence: false,           // per-card tick lists
    attempts: false,           // AUTO-VETO attempt tallies
    lateCurseConversion: false,// curses drawn late costing coins not time

    // A running head-to-head total all afternoon makes it a race. Off means the
    // numbers stay out of sight until dinner, when they all come out at once.
    liveScores: false,
    // A photo and a line on each card, so the day sheet becomes the record of
    // what you found rather than a column of coins.
    notes: true,
  },

  // Escape hatches on the day sheet: start a day over, or clear everything.
  // True for the demo so a run that gets into a strange state can be cleared
  // without anybody's help. The real build sets this false — nobody should be
  // able to wipe a real afternoon with a mis-tap.
  allowReset: true,

  // null = no password, open straight on the player picker.
  // The real build turns the gate on by putting a word here. Nothing else changes.
  password: null,

  // -- Clock ----------------------------------------------------------------
  clock: {
    // 6 = one demo minute per ten real seconds. A day plays through in about
    // half an hour. The real build sets this to 1.
    speedFactor: 6,
    note: 'One demo minute per ten real seconds.',
    // A fixed game-clock start, so a demo day is a predictable length.
    // The real build sets this to null, which means "use the actual time of
    // day when START is pressed" — open earlier, play longer.
    fixedStart: '12:00',
  },

  // -- Players --------------------------------------------------------------
  players: [
    { id: 'betsy', name: 'Betsy' },
    { id: 'jason', name: 'Jason' },
    { id: 'greg', name: 'Greg' },
    { id: 'peter', name: 'Peter' },
  ],

  // -- Pairings -------------------------------------------------------------
  // Day 1 takes one of these. Day 2 automatically takes the other. It is not
  // possible to pick the same pairing twice or to leave one unused, because
  // there are exactly two and choosing one assigns the other.
  choosablePairings: [
    {
      id: 'bg-jp',
      A: { name: 'Betsy & Greg', members: ['betsy', 'greg'] },
      B: { name: 'Jason & Peter', members: ['jason', 'peter'] },
    },
    {
      id: 'bp-jg',
      A: { name: 'Betsy & Peter', members: ['betsy', 'peter'] },
      B: { name: 'Jason & Greg', members: ['jason', 'greg'] },
    },
  ],

  // Day 3 is fixed and not choosable.
  fixedPairing: {
    id: 'parents-kids',
    label: 'Parents vs Kids',
    A: { name: 'Betsy & Jason', members: ['betsy', 'jason'] },
    B: { name: 'Greg & Peter', members: ['greg', 'peter'] },
  },

  // -- Rules ----------------------------------------------------------------
  // Every number the engine uses. None of these appear anywhere else.
  rules: {
    handSize: 3,
    // Skipping used to freeze you for ten minutes, which meant standing in a
    // street doing nothing. A budget is the same pressure in one sentence,
    // with no dead time: you get three, spend them well.
    skipsPerDay: 3,
    // One share for every contested card. There used to be two, which nobody
    // could be expected to remember mid-afternoon.
    loserShare: 0.25,
    // No prize for clearing the deck. It paid 1,500 for volume, which is a
    // reason to rush past things rather than go deep on one. Clearing it still
    // ends your day; it just is not worth coins.
    cleanSweepBonus: 0,
  },

  // -- Card types -----------------------------------------------------------
  // Labels and how each type behaves. The UI reads these; it does not know the
  // type names itself.
  // Two kinds, and neither is jargon. The card says what it means in a
  // sentence; nobody has to learn a vocabulary.
  cardTypes: {
    SOLO: {
      label: 'JUST DO IT',
      line: 'Both teams can score this one. Just do it.',
      versus: false,
    },
    VERSUS: {
      label: 'BOTH TEAMS',
      line: 'Both teams are doing this. The better one wins at dinner.',
      versus: true,
    },
  },

  // Modifiers a card can carry, shown as a second label.
  cardTags: {
    timeSink: { label: 'THE BIG ONE', note: 'Worth a lot, and it will eat most of an afternoon.' },
    build: { label: 'BUILD', note: 'Something to construct.' },
    // Doable on a train, in a queue, at a table. When you are stuck waiting,
    // these turn the dead twenty minutes into part of the day.
    anywhere: { label: 'ANYWHERE', note: 'No particular place needed. Good for a train.' },
  },

  // -- Curses ---------------------------------------------------------------
  // One in six draws. Take the coins, then pay.
  //
  // effect.kind is read by the engine:
  //   freeze   — frozen where you stand for `minutes`
  //   toll     — pay the other team `amount`
  //   noMaps   — no looking things up for `minutes` (no mechanical effect, displayed)
  //   half     — your next completed card is worth half
  //   onFoot   — no shortcuts for `minutes` (no mechanical effect, displayed)
  //   oneCard  — hold only one card for `minutes`
  //   drain    — lose `amount` every `everyMinutes` for `minutes`
  //   blank    — next draw discarded unseen, then a freeze of `minutes`
  // Three kinds. Each is one sentence, each enforces itself, and the app tells
  // you exactly what to do when one lands. There used to be eight.
  // Three kinds, and not one of them costs you time. A penalty that makes you
  // stand still for fifteen minutes is a mechanic whose entire content is "be
  // bored", which is the opposite of the point of the day. You take the coins,
  // then you pay in coins.
  curses: {
    'c-cupboard': {
      title: 'The cupboard',
      value: 900,
      body: 'Something has fallen out and it is now your problem. Lose 500 on the spot.',
      effect: { kind: 'coins', amount: -500 },
    },
    'c-dishes': {
      title: 'Dishes',
      value: 1100,
      body: 'It is your turn at the sink and it was not going to be. Pay the other team 600.',
      effect: { kind: 'toll', amount: 600 },
    },
    'c-leftovers': {
      title: 'Leftovers',
      value: 800,
      body: 'You are eating what is already in there. Your next card is worth half.',
      effect: { kind: 'half' },
    },
  },

  // -- Cards ----------------------------------------------------------------
  cards: {
    // ---- DAY ONE ----
    'd1-drawer': {
      title: 'The drawer',
      evidence: ['photo before', 'photo after'],
      minutes: 90,
      value: 2400,
      type: 'VERSUS',
      tags: ['timeSink'],
      body: 'Empty one kitchen drawer completely onto the table. Sort it. Put it back. Photograph it before and after. Both teams will do this and only the better drawer scores. Expect this to eat ninety minutes and to turn up at least one key that opens nothing.',
    },
    'd1-tower': {
      title: 'The book tower',
      evidence: ['video, ten seconds'],
      value: 1400,
      type: 'SOLO',
      tags: ['build'],
      body: 'Build a freestanding tower of six books, at least 30cm tall, standing on its own for ten seconds on camera. No tape, nothing leaning, nothing you were already holding.',
    },
    'd1-pen': {
      tags: ['anywhere'],
      title: 'The pen graveyard',
      evidence: ['video, proven on paper'],
      value: 900,
      type: 'VERSUS',
      body: 'Find the worst pen in this house. It must be proven dead on paper, on camera. Most thoroughly dead pen wins. Chewing is an aggravating factor.',
    },
    'd1-chair': {
      title: 'A chair that has given up',
      evidence: ['video, with concern'],
      value: 800,
      type: 'VERSUS',
      body: 'The most defeated seating in the house. Video, with sincere expressed concern for it. Judged on the sag and on the sincerity, separately.',
    },
    'd1-slipper': {
      title: 'The defeated slipper',
      evidence: ['photo'],
      value: 800,
      type: 'VERSUS',
      body: 'Flattened, odd, sole departed, found under something. Most thoroughly finished slipper wins.',
    },
    'd1-beige': {
      tags: ['anywhere'],
      title: 'Beige on purpose',
      evidence: ['photo', 'your defence'],
      value: 700,
      type: 'VERSUS',
      body: 'Find something that is beige because somebody chose beige, not beige because it faded. Both teams present. The better defence of the distinction takes it, not the better object.',
    },
    'd1-magnets': {
      title: 'Fridge magnets',
      evidence: ['photo of the door', 'your best four'],
      value: 900,
      type: 'VERSUS',
      body: 'Photograph the fridge door. Present your best four magnets. Judged on the four, not the count. Double if the winning set includes somewhere nobody in this room has been.',
    },
    'd1-mugs': {
      title: 'Three mugs, three rooms',
      evidence: ['photo, three rooms'],
      value: 900,
      type: 'SOLO',
      body: 'Three separate mugs, three separate rooms, none of them the kitchen. They may be clean. They will not be.',
    },
    'd1-coins': {
      title: 'Exact change in the sofa',
      evidence: ['photo in your palm'],
      value: 800,
      type: 'SOLO',
      body: 'Find coins down the back of something soft. Photograph them in your palm. Nobody is allowed to lift a cushion for you.',
    },
    'd1-cupboard': {
      title: 'Food from a cupboard',
      evidence: ['photo of the date'],
      value: 600,
      type: 'SOLO',
      body: 'Find a tin whose best-before date has passed. Photograph the date with the tin still on the shelf.',
    },
    'd1-socks': {
      title: 'Sock census',
      evidence: ['photo of the drawer'],
      value: 500,
      type: 'SOLO',
      body: 'Count the odd socks in one drawer. Photograph the drawer as you count.',
    },
    'd1-basket': {
      title: 'The laundry basket landing',
      evidence: ['video of the landing'],
      value: 1200,
      type: 'SOLO',
      body: 'From one metre, throw a rolled pair of socks so it lands in the basket and stays in the basket. Alternate attempts. Put them away either way.',
    },
    'd1-spoon': {
      title: 'The wooden spoon',
      evidence: ['photo'],
      value: 1200,
      type: 'SOLO',
      // Marks this as the card that appears on two days. If either team
      // completes it, it is removed from the later deck automatically. The app
      // sets the flag; nobody has to remember at breakfast.
      linkedFlag: 'spoonFound',
      body: 'Somebody in this house owns a wooden spoon older than the kitchen it lives in. Find it and photograph it. Double if it is burnt at one end. Keep it.',
    },
    'd1-ask': {
      title: 'Ask someone in this house',
      evidence: ['who you asked', 'the story'],
      value: 900,
      type: 'VERSUS',
      body: 'Ask somebody who lives here where the good scissors are. Go there. Better story wins, not better scissors.',
    },

    // ---- DAY TWO ----
    'd2-cupboard': {
      title: 'The whole cupboard',
      evidence: ['photo, ten things'],
      minutes: 90,
      value: 2200,
      type: 'VERSUS',
      tags: ['timeSink'],
      body: 'Take everything out of one cupboard and photograph ten distinct things it has become: pantry, chemistry set, archive, somebody else’s problem. Judged on the ten, not the cupboard. This will take ninety minutes and it is the best ninety minutes in this house.',
    },
    'd2-tower': {
      title: 'The second tower',
      evidence: ['video, ten seconds'],
      value: 1400,
      type: 'SOLO',
      tags: ['build'],
      body: 'Freestanding tower at least 30cm tall from six or more separate objects found in this house today, unsupported for ten seconds on camera. No tape, nothing leaning.',
    },
    'd2-sofa': {
      title: 'Under the sofa',
      evidence: ['photo from underneath'],
      value: 1000,
      type: 'VERSUS',
      body: 'Get underneath the largest piece of furniture in the house and photograph what is under there, with the underside visibly above you. Best find wins.',
    },
    'd2-seat': {
      tags: ['anywhere'],
      title: 'Best seat in the house',
      evidence: ['photo', 'your defence'],
      value: 1000,
      type: 'VERSUS',
      body: 'Nominate the single best place to sit in this house and defend it. The winning team picks what is on television tonight.',
    },
    'd2-decades': {
      tags: ['anywhere'],
      title: 'Two decades apart',
      evidence: ['photo from one spot', 'both dates'],
      value: 900,
      type: 'VERSUS',
      body: 'Two objects visible from one standing position, acquired at least twenty years apart. Largest verified gap wins. Be able to say roughly when each arrived.',
    },
    'd2-tupperware': {
      title: 'A very small tupperware',
      evidence: ['photo beside your hand'],
      value: 800,
      type: 'VERSUS',
      body: 'A container too small to hold a useful amount of anything. Photograph it beside your hand, not in it. Smallest wins. Double if it still has its own lid.',
    },
    'd2-fridge': {
      title: 'Eat something from the back of the fridge',
      evidence: ['video of the eating', 'the label'],
      value: 800,
      type: 'VERSUS',
      body: 'You may not read the label before eating it. Eat it. Then read it. Weirdest thing successfully eaten wins. Nothing actually off.',
    },
    'd2-gadget': {
      tags: ['anywhere'],
      title: 'A gadget worth more than a car',
      evidence: ['photo', 'your valuation'],
      value: 700,
      type: 'VERSUS',
      body: 'The most absurd single-purpose device in the kitchen. Argue its value at the table. Anything that only spiralises counts double in spirit and not at all in coins.',
    },
    'd2-shelf': {
      title: 'The empty shelf',
      evidence: ['photo'],
      value: 800,
      type: 'SOLO',
      body: 'Find a shelf with nothing on it and photograph it before anybody puts anything on it. Double if somebody who does not live here takes the photograph.',
    },
    'd2-remotes': {
      title: 'Three remote controls',
      evidence: ['photo, three of them'],
      value: 700,
      type: 'SOLO',
      body: 'Three separate remotes for three separate things. Double if one of them is for something nobody owns any more.',
    },
    'd2-towels': {
      title: 'Three colours of towel',
      evidence: ['photo'],
      value: 500,
      type: 'SOLO',
      body: 'Three different towels, three genuinely different colours, all in the same room.',
    },

    // ---- DAY THREE ----
    'd3-cupboards': {
      title: 'Three cupboards',
      evidence: ['photo, all three'],
      minutes: 120,
      value: 2400,
      type: 'VERSUS',
      tags: ['timeSink'],
      body: 'Open three cupboards you have never opened. Photograph the contents of all three. Judged on the three, not the count. Strangest set wins. This will eat two hours and you will find things nobody has seen since a previous address.',
    },
    'd3-span': {
      title: 'The taller tower',
      evidence: ['video, ten seconds'],
      value: 1400,
      type: 'SOLO',
      tags: ['build'],
      body: 'Rematch. Freestanding tower at least 40cm tall, ten centimetres more than last time, holding a biscuit at the top for ten seconds. Objects found today.',
    },
    'd3-explain': {
      tags: ['anywhere'],
      title: 'Something you cannot explain',
      evidence: ['photo'],
      value: 1400,
      type: 'VERSUS',
      body: 'Find and photograph one object in this house that neither team can account for. Both presented at the table. The one that survives explanation wins.',
    },
    'd3-junk': {
      title: 'The junk drawer market',
      evidence: ['photo, three things'],
      value: 1000,
      type: 'VERSUS',
      body: 'Take three things from three different drawers, none of them a drawer you have already opened today. Best three wins.',
    },
    'd3-best': {
      tags: ['anywhere'],
      title: 'Ask for the best thing in this room',
      evidence: ['who you asked', 'photo of the outcome'],
      value: 900,
      type: 'VERSUS',
      body: 'Ask somebody what the best thing in the room you are standing in is. Do whatever they say. Better outcome wins. If they say nothing in here is any good, that counts and is funnier.',
    },
    'd3-shelf': {
      title: 'A shelf from a shelf',
      evidence: ['photo, one frame'],
      value: 900,
      type: 'VERSUS',
      body: 'Stand at one shelf and photograph another. Most shelves visible in one frame wins.',
    },
    'd3-hooks': {
      title: 'Hooks',
      evidence: ['your best five'],
      value: 800,
      type: 'VERSUS',
      body: 'Almost every hallway has more coat hooks than coats. Present your best five. Double if the winning set catches one actually in use.',
    },
    'd3-cleaner': {
      title: 'A cleaning product you cannot pronounce',
      evidence: ['video of the attempt'],
      value: 800,
      type: 'VERSUS',
      body: 'Find one by pointing, having failed to say its name. Video of the attempt required. Worst attempt wins. Do not drink it.',
    },
    'd3-fridge': {
      title: 'The oldest thing in the fridge',
      evidence: ['video at arm’s length', 'photo of the date'],
      value: 1000,
      type: 'SOLO',
      body: 'Find the oldest dated item in the fridge. Photograph the date. Hold it at arm’s length. Do not open it. Video required.',
    },
    'd3-cushions': {
      title: 'Cushion census',
      evidence: ['photo of the stretch'],
      value: 700,
      type: 'SOLO',
      body: 'Count the cushions on one continuous stretch of soft furniture, minimum two metres. Photograph the stretch.',
    },
    'd3-spoon': {
      title: 'The wooden spoon',
      evidence: ['photo'],
      value: 1200,
      type: 'SOLO',
      linkedFlag: 'spoonFound',
      body: 'Removed from this deck if it was already found. Older than the kitchen it lives in. Double if it is burnt at one end. Keep it.',
    },
    'd3-biscuit': {
      title: 'The last biscuit',
      evidence: ['photo, standing up'],
      value: 600,
      type: 'SOLO',
      body: 'Fresh from the tin. Eat it standing up. It is the last day.',
    },
  },

  // -- Days -----------------------------------------------------------------
  // `sequence` is the draw order and it is identical for both teams. Curses sit
  // at fixed positions in it, so curse density is the same for everybody. Deck
  // size is however long this array is.
  days: [
    {
      id: 1,
      label: 'DAY ONE',
      date: 'Sun 16 Aug',
      place: 'Amsterdam — centre and north',
      demoPlace: 'The house — kitchen and upstairs',
      pairing: 'choice',       // Day 1 takes the chosen pairing
      whistle: '15:30',
      offsetB: 0,              // both teams start at the same place in the deck
      // You are apart today, so seeing that they have already banked a card is
      // pressure rather than a leak. Day 3 turns this off.
      showOpponentProgress: true,
      sequence: [
        { kind: 'card', id: 'd1-drawer' },
        { kind: 'card', id: 'd1-tower' },
        { kind: 'card', id: 'd1-pen' },
        { kind: 'card', id: 'd1-chair' },
        { kind: 'curse', id: 'c-cupboard' },
        { kind: 'card', id: 'd1-slipper' },
        { kind: 'card', id: 'd1-beige' },
        { kind: 'card', id: 'd1-magnets' },
        { kind: 'card', id: 'd1-mugs' },
        { kind: 'card', id: 'd1-coins' },
        { kind: 'curse', id: 'c-dishes' },
        { kind: 'card', id: 'd1-cupboard' },
        { kind: 'card', id: 'd1-socks' },
        { kind: 'card', id: 'd1-basket' },
        { kind: 'card', id: 'd1-spoon' },
        { kind: 'curse', id: 'c-leftovers' },
        { kind: 'card', id: 'd1-ask' },
      ],
    },
    {
      id: 2,
      label: 'DAY TWO',
      date: 'Tue 18 Aug',
      place: 'Utrecht',
      demoPlace: 'The house — the cupboards',
      pairing: 'remainder',    // whatever Day 1 did not take
      whistle: '15:00',
      offsetB: 0,
      showOpponentProgress: true,
      sequence: [
        { kind: 'card', id: 'd2-cupboard' },
        { kind: 'card', id: 'd2-tower' },
        { kind: 'card', id: 'd2-sofa' },
        { kind: 'card', id: 'd2-seat' },
        { kind: 'curse', id: 'c-dishes' },
        { kind: 'card', id: 'd2-decades' },
        { kind: 'card', id: 'd2-tupperware' },
        { kind: 'card', id: 'd2-fridge' },
        { kind: 'card', id: 'd2-gadget' },
        { kind: 'card', id: 'd2-shelf' },
        { kind: 'curse', id: 'c-cupboard' },
        { kind: 'card', id: 'd2-remotes' },
        { kind: 'card', id: 'd2-towels' },
      ],
    },
    {
      id: 3,
      label: 'DAY THREE',
      date: 'Thu 20 Aug',
      place: 'Amsterdam — south and west',
      demoPlace: 'The house — same ground',
      pairing: 'fixed',        // Parents vs Kids
      whistle: '15:30',
      // Same deck, same order, phase-shifted. Otherwise on a same-ground day
      // both teams stand in the same place all afternoon.
      offsetB: 6,
      // Same ground, interference allowed. Showing their progress would remove
      // everything there is to bluff about.
      showOpponentProgress: false,
      sequence: [
        { kind: 'card', id: 'd3-cupboards' },
        { kind: 'card', id: 'd3-span' },
        { kind: 'card', id: 'd3-explain' },
        { kind: 'card', id: 'd3-junk' },
        { kind: 'curse', id: 'c-leftovers' },
        { kind: 'card', id: 'd3-best' },
        { kind: 'card', id: 'd3-shelf' },
        { kind: 'card', id: 'd3-hooks' },
        { kind: 'card', id: 'd3-cleaner' },
        { kind: 'curse', id: 'c-leftovers' },
        { kind: 'card', id: 'd3-fridge' },
        { kind: 'card', id: 'd3-cushions' },
        { kind: 'card', id: 'd3-spoon' },
        { kind: 'curse', id: 'c-dishes' },
        { kind: 'card', id: 'd3-biscuit' },
      ],
    },
  ],

  // -- Dinner ---------------------------------------------------------------
  // Kept: they cost nothing to understand and they are the best part of dinner.
  superlativePrompts: [
    'Most Confident Wrong Answer',
    'Best Unprompted Interaction With A Cupboard',
    'Worst Photograph Of Something Clean',
    'Most Committed To A Wrong Drawer',
    'Finest Sitting Down',
    'Most Dignified Under Curse',
    'Best Use Of A Tea Towel',
    'Worst Decision Taken With Full Information',
  ],

  // -- Standing text --------------------------------------------------------
  // Anything the app prints that is not a card. Kept here so a content swap
  // changes the words too.
  text: {
    noRunning: 'NO RUNNING. Nobody runs, for any card, at any point. No card rewards speed.',
    skipRule: 'You get three skips a day. Spend them well.',
    curseRule: 'One draw in six is a curse. Take the coins, then pay.',
    sweepRule: 'Clear every card before the whistle and play stops for you. The score banks and you take 1,500.',
    whistleRule: 'The whistle ends play. Dinner declares the winner, because VERSUS cards cannot be settled in the street.',
    dinnerIntro: 'Every VERSUS card both teams reached, side by side. Pick a winner for each, then declare.',
  },
};

export default content;
