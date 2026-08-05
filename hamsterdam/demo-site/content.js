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
    vetoFreezeMinutes: 10,      // game minutes, frozen, blocks the next draw
    versusLoserShare: 0.25,     // loser of a VERSUS still banks a quarter
    timeSinkLoserShare: 1 / 3,  // a third, because ninety minutes for nothing is unrecoverable
    positionDouble: 2,
    positionTriple: 3,          // declared before the team's second completion
    positionFailPenalty: -800,
    cleanSweepBonus: 1500,
    zoneLiftMinutes: 90,        // after the split, relative to start
    lateCurseFlatPenalty: -600, // a converted curse pays this instead of costing time
  },

  // -- Card types -----------------------------------------------------------
  // Labels and how each type behaves. The UI reads these; it does not know the
  // type names itself.
  cardTypes: {
    SOLO: { label: 'SOLO', note: 'Fixed value. Both teams can score.', versus: false },
    VERSUS: { label: 'VERSUS', note: 'Both teams attempt. Winner takes full value, loser a quarter. Settled at dinner.', versus: true },
    AUTO_VETO: { label: 'AUTO-VETO', note: 'Limited attempts. No penalty for failure.', versus: false },
  },

  // Modifiers a card can carry, shown as a second label.
  cardTags: {
    timeSink: { label: 'TIME SINK', note: 'Roughly double value. This will openly eat about ninety minutes. Loser takes a third.' },
    build: { label: 'BUILD', note: 'Something to construct.' },
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
  curses: {
    'c-laundry': {
      title: 'Laundry',
      value: 900,
      body: 'Sit down with the laundry where you stand. Fifteen minutes. You may fold. No planning, no looking ahead.',
      effect: { kind: 'freeze', minutes: 15 },
    },
    'c-dishes': {
      title: 'Dishes',
      value: 1100,
      body: 'It is your turn at the sink and it was not going to be. Pay the other team 600, settled at the table.',
      effect: { kind: 'toll', amount: 600 },
    },
    'c-bulb': {
      title: 'The bulb has gone',
      value: 900,
      body: 'Nobody can see anything. No looking anything up for twenty minutes. Labels, memory and shouting through a doorway only.',
      effect: { kind: 'noMaps', minutes: 20 },
    },
    'c-leftovers': {
      title: 'Leftovers',
      value: 800,
      body: 'You are eating what is already in there. Your next completed card is worth half.',
      effect: { kind: 'half' },
    },
    'c-stairs': {
      title: 'The stairs',
      value: 900,
      body: 'The long way round, every time, for twenty-five minutes. No shortcuts through the kitchen.',
      effect: { kind: 'onFoot', minutes: 25 },
    },
    'c-basket': {
      title: 'A smaller basket',
      value: 700,
      body: 'You cannot carry what you were carrying. For thirty minutes you hold only one card.',
      effect: { kind: 'oneCard', minutes: 30 },
    },
    'c-tap': {
      title: 'The tap is dripping',
      value: 1200,
      body: 'Nobody is going to fix it. Lose 100 coins every five minutes for half an hour. This can take you negative.',
      effect: { kind: 'drain', amount: 100, everyMinutes: 5, minutes: 30 },
    },
    'c-bin': {
      title: 'The wrong bin',
      value: 700,
      body: 'It has already gone out. Your next draw is discarded unseen, then five minutes standing at the kerb.',
      effect: { kind: 'blank', minutes: 5 },
    },
  },

  // -- Cards ----------------------------------------------------------------
  cards: {
    // ---- DAY ONE ----
    'd1-drawer': {
      title: 'The drawer',
      value: 2400,
      type: 'VERSUS',
      tags: ['timeSink'],
      body: 'Empty one kitchen drawer completely onto the table. Sort it. Put it back. Photograph it before and after. Both teams will do this and only the better drawer scores. Expect this to eat ninety minutes and to turn up at least one key that opens nothing.',
    },
    'd1-tower': {
      title: 'The book tower',
      value: 1400,
      type: 'AUTO_VETO',
      attempts: 3,
      tags: ['build'],
      body: 'Build a freestanding tower of six books, at least 30cm tall, standing on its own for ten seconds on camera. No tape, nothing leaning, nothing you were already holding.',
    },
    'd1-pen': {
      title: 'The pen graveyard',
      value: 900,
      type: 'VERSUS',
      body: 'Find the worst pen in this house. It must be proven dead on paper, on camera. Most thoroughly dead pen wins. Chewing is an aggravating factor.',
    },
    'd1-chair': {
      title: 'A chair that has given up',
      value: 800,
      type: 'VERSUS',
      body: 'The most defeated seating in the house. Video, with sincere expressed concern for it. Judged on the sag and on the sincerity, separately.',
    },
    'd1-slipper': {
      title: 'The defeated slipper',
      value: 800,
      type: 'VERSUS',
      body: 'Flattened, odd, sole departed, found under something. Most thoroughly finished slipper wins.',
    },
    'd1-beige': {
      title: 'Beige on purpose',
      value: 700,
      type: 'VERSUS',
      body: 'Find something that is beige because somebody chose beige, not beige because it faded. Both teams present. The better defence of the distinction takes it, not the better object.',
    },
    'd1-magnets': {
      title: 'Fridge magnets',
      value: 900,
      type: 'VERSUS',
      body: 'Photograph the fridge door. Present your best four magnets. Judged on the four, not the count. Double if the winning set includes somewhere nobody in this room has been.',
    },
    'd1-mugs': {
      title: 'Three mugs, three rooms',
      value: 900,
      type: 'SOLO',
      body: 'Three separate mugs, three separate rooms, none of them the kitchen. They may be clean. They will not be.',
    },
    'd1-coins': {
      title: 'Exact change in the sofa',
      value: 800,
      type: 'SOLO',
      body: 'Find coins down the back of something soft. Photograph them in your palm. Nobody is allowed to lift a cushion for you.',
    },
    'd1-cupboard': {
      title: 'Food from a cupboard',
      value: 600,
      type: 'SOLO',
      body: 'Find a tin whose best-before date has passed. Photograph the date with the tin still on the shelf.',
    },
    'd1-socks': {
      title: 'Sock census',
      value: 500,
      type: 'SOLO',
      body: 'Count the odd socks in one drawer. Photograph the drawer as you count.',
    },
    'd1-basket': {
      title: 'The laundry basket landing',
      value: 1200,
      type: 'AUTO_VETO',
      attempts: 5,
      body: 'From one metre, throw a rolled pair of socks so it lands in the basket and stays in the basket. Alternate attempts. Put them away either way.',
    },
    'd1-spoon': {
      title: 'The wooden spoon',
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
      value: 900,
      type: 'VERSUS',
      body: 'Ask somebody who lives here where the good scissors are. Go there. Better story wins, not better scissors.',
    },

    // ---- DAY TWO ----
    'd2-cupboard': {
      title: 'The whole cupboard',
      value: 2200,
      type: 'VERSUS',
      tags: ['timeSink'],
      body: 'Take everything out of one cupboard and photograph ten distinct things it has become: pantry, chemistry set, archive, somebody else’s problem. Judged on the ten, not the cupboard. This will take ninety minutes and it is the best ninety minutes in this house.',
    },
    'd2-tower': {
      title: 'The second tower',
      value: 1400,
      type: 'AUTO_VETO',
      attempts: 3,
      tags: ['build'],
      body: 'Freestanding tower at least 30cm tall from six or more separate objects found in this house today, unsupported for ten seconds on camera. No tape, nothing leaning.',
    },
    'd2-sofa': {
      title: 'Under the sofa',
      value: 1000,
      type: 'VERSUS',
      body: 'Get underneath the largest piece of furniture in the house and photograph what is under there, with the underside visibly above you. Best find wins.',
    },
    'd2-seat': {
      title: 'Best seat in the house',
      value: 1000,
      type: 'VERSUS',
      body: 'Nominate the single best place to sit in this house and defend it. The winning team picks what is on television tonight.',
    },
    'd2-decades': {
      title: 'Two decades apart',
      value: 900,
      type: 'VERSUS',
      body: 'Two objects visible from one standing position, acquired at least twenty years apart. Largest verified gap wins. Be able to say roughly when each arrived.',
    },
    'd2-tupperware': {
      title: 'A very small tupperware',
      value: 800,
      type: 'VERSUS',
      body: 'A container too small to hold a useful amount of anything. Photograph it beside your hand, not in it. Smallest wins. Double if it still has its own lid.',
    },
    'd2-fridge': {
      title: 'Eat something from the back of the fridge',
      value: 800,
      type: 'VERSUS',
      body: 'You may not read the label before eating it. Eat it. Then read it. Weirdest thing successfully eaten wins. Nothing actually off.',
    },
    'd2-gadget': {
      title: 'A gadget worth more than a car',
      value: 700,
      type: 'VERSUS',
      body: 'The most absurd single-purpose device in the kitchen. Argue its value at the table. Anything that only spiralises counts double in spirit and not at all in coins.',
    },
    'd2-shelf': {
      title: 'The empty shelf',
      value: 800,
      type: 'SOLO',
      body: 'Find a shelf with nothing on it and photograph it before anybody puts anything on it. Double if somebody who does not live here takes the photograph.',
    },
    'd2-remotes': {
      title: 'Three remote controls',
      value: 700,
      type: 'SOLO',
      body: 'Three separate remotes for three separate things. Double if one of them is for something nobody owns any more.',
    },
    'd2-towels': {
      title: 'Three colours of towel',
      value: 500,
      type: 'SOLO',
      body: 'Three different towels, three genuinely different colours, all in the same room.',
    },

    // ---- DAY THREE ----
    'd3-cupboards': {
      title: 'Three cupboards',
      value: 2400,
      type: 'VERSUS',
      tags: ['timeSink'],
      body: 'Open three cupboards you have never opened. Photograph the contents of all three. Judged on the three, not the count. Strangest set wins. This will eat two hours and you will find things nobody has seen since a previous address.',
    },
    'd3-span': {
      title: 'The taller tower',
      value: 1400,
      type: 'AUTO_VETO',
      attempts: 3,
      tags: ['build'],
      body: 'Rematch. Freestanding tower at least 40cm tall, ten centimetres more than last time, holding a biscuit at the top for ten seconds. Objects found today.',
    },
    'd3-explain': {
      title: 'Something you cannot explain',
      value: 1400,
      type: 'VERSUS',
      body: 'Find and photograph one object in this house that neither team can account for. Both presented at the table. The one that survives explanation wins.',
    },
    'd3-junk': {
      title: 'The junk drawer market',
      value: 1000,
      type: 'VERSUS',
      body: 'Take three things from three different drawers, none of them a drawer you have already opened today. Best three wins.',
    },
    'd3-best': {
      title: 'Ask for the best thing in this room',
      value: 900,
      type: 'VERSUS',
      body: 'Ask somebody what the best thing in the room you are standing in is. Do whatever they say. Better outcome wins. If they say nothing in here is any good, that counts and is funnier.',
    },
    'd3-shelf': {
      title: 'A shelf from a shelf',
      value: 900,
      type: 'VERSUS',
      body: 'Stand at one shelf and photograph another. Most shelves visible in one frame wins.',
    },
    'd3-hooks': {
      title: 'Hooks',
      value: 800,
      type: 'VERSUS',
      body: 'Almost every hallway has more coat hooks than coats. Present your best five. Double if the winning set catches one actually in use.',
    },
    'd3-cleaner': {
      title: 'A cleaning product you cannot pronounce',
      value: 800,
      type: 'VERSUS',
      body: 'Find one by pointing, having failed to say its name. Video of the attempt required. Worst attempt wins. Do not drink it.',
    },
    'd3-fridge': {
      title: 'The oldest thing in the fridge',
      value: 1000,
      type: 'SOLO',
      body: 'Find the oldest dated item in the fridge. Photograph the date. Hold it at arm’s length. Do not open it. Video required.',
    },
    'd3-cushions': {
      title: 'Cushion census',
      value: 700,
      type: 'SOLO',
      body: 'Count the cushions on one continuous stretch of soft furniture, minimum two metres. Photograph the stretch.',
    },
    'd3-spoon': {
      title: 'The wooden spoon',
      value: 1200,
      type: 'SOLO',
      linkedFlag: 'spoonFound',
      body: 'Removed from this deck if it was already found. Older than the kitchen it lives in. Double if it is burnt at one end. Keep it.',
    },
    'd3-biscuit': {
      title: 'The last biscuit',
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
      convertAt: '14:45',      // after this, a curse costs coins instead of time
      offsetB: 0,              // both teams start at the same place in the deck
      findMy: { enabled: true, cost: 300, label: 'Check where they are' },
      zones: {
        A: 'Upstairs and the landing',
        B: 'Downstairs and the garden',
        lifts: 'The whole house opens 90 minutes after the split.',
      },
      sequence: [
        { kind: 'card', id: 'd1-drawer' },
        { kind: 'card', id: 'd1-tower' },
        { kind: 'card', id: 'd1-pen' },
        { kind: 'card', id: 'd1-chair' },
        { kind: 'curse', id: 'c-laundry' },
        { kind: 'card', id: 'd1-slipper' },
        { kind: 'card', id: 'd1-beige' },
        { kind: 'card', id: 'd1-magnets' },
        { kind: 'card', id: 'd1-mugs' },
        { kind: 'card', id: 'd1-coins' },
        { kind: 'curse', id: 'c-tap' },
        { kind: 'card', id: 'd1-cupboard' },
        { kind: 'card', id: 'd1-socks' },
        { kind: 'card', id: 'd1-basket' },
        { kind: 'card', id: 'd1-spoon' },
        { kind: 'curse', id: 'c-bin' },
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
      convertAt: '14:15',
      offsetB: 0,
      findMy: { enabled: true, cost: 300, label: 'Check where they are' },
      zones: {
        A: 'North of the kettle',
        B: 'South of the kettle',
        lifts: 'The whole house opens 90 minutes after the split.',
      },
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
        { kind: 'curse', id: 'c-basket' },
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
      convertAt: '14:45',
      // Same deck, same order, phase-shifted. Otherwise on a same-ground day
      // both teams stand in the same place all afternoon.
      offsetB: 6,
      findMy: { enabled: true, cost: 0, label: 'Check where they are — free today' },
      zones: null,             // same ground, no split
      interference: 'Misdirection, decoys, claiming a room first: fair. Flat lies, hiding their things, physical blocking: not.',
      sequence: [
        { kind: 'card', id: 'd3-cupboards' },
        { kind: 'card', id: 'd3-span' },
        { kind: 'card', id: 'd3-explain' },
        { kind: 'card', id: 'd3-junk' },
        { kind: 'curse', id: 'c-bulb' },
        { kind: 'card', id: 'd3-best' },
        { kind: 'card', id: 'd3-shelf' },
        { kind: 'card', id: 'd3-hooks' },
        { kind: 'card', id: 'd3-cleaner' },
        { kind: 'curse', id: 'c-leftovers' },
        { kind: 'card', id: 'd3-fridge' },
        { kind: 'card', id: 'd3-cushions' },
        { kind: 'card', id: 'd3-spoon' },
        { kind: 'curse', id: 'c-stairs' },
        { kind: 'card', id: 'd3-biscuit' },
      ],
    },
  ],

  // -- Standing mechanics ---------------------------------------------------
  // Four persistent counters, one per player, tappable from any screen at any
  // time. They fire opportunistically and must not require opening a card.
  //
  // credit: 'own'   -> the team that player is on today
  //         'other' -> the opposing team
  // dailyLimit: number of taps allowed per day across all of this mechanic's
  //             buttons, or null for unlimited.
  standingMechanics: [
    {
      id: 'remote',
      player: 'greg',
      title: 'The Remote',
      note: 'Once a day the team Greg is not on may ask him where the remote is. He answers immediately, with total confidence, no looking.',
      dailyLimit: 1,
      buttons: [
        { id: 'right', label: 'He was right', value: 700, credit: 'own' },
        { id: 'wrong', label: 'He was wrong', value: 700, credit: 'other' },
      ],
    },
    {
      id: 'sigh',
      player: 'jason',
      title: 'The Sigh Tax',
      note: 'Each theatrical sigh at the state of a cupboard costs his team 100. Each one that makes somebody else laugh out loud earns 400.',
      dailyLimit: 1,
      buttons: [
        { id: 'sigh', label: 'A sigh', value: -100, credit: 'own' },
        { id: 'laugh', label: 'Made somebody laugh', value: 400, credit: 'own' },
      ],
    },
    {
      id: 'weather',
      player: 'peter',
      title: 'Weather Facts',
      note: 'The first time each day he delivers an unsolicited fact about the weather to somebody who did not ask, and gets an audible response.',
      dailyLimit: 1,
      buttons: [
        { id: 'delivered', label: 'Delivered', value: 500, credit: 'own' },
        { id: 'followup', label: 'They asked a follow-up', value: 1000, credit: 'own' },
      ],
    },
    {
      id: 'doorbell',
      player: 'betsy',
      title: 'The Doorbell',
      note: 'Whenever somebody asks her where something is, unprompted. Unlimited, any number of times a day. The other three fire once each.',
      dailyLimit: null,
      buttons: [
        { id: 'asked', label: 'Asked, unprompted', value: 600, credit: 'own' },
      ],
    },
  ],

  // -- Dinner ---------------------------------------------------------------
  superlativePrompts: [
    'Most Confident Wrong Answer',
    'Best Unprompted Interaction With A Cupboard',
    'Worst Photograph Of Something Clean',
    'Most Committed To A Wrong Drawer',
    'Finest Sitting Down',
    'Most Dignified Under Curse',
    'Best Use Of A Tea Towel',
    'Worst Position Taken With Full Information',
  ],

  // -- Standing text --------------------------------------------------------
  // Anything the app prints that is not a card. Kept here so a content swap
  // changes the words too.
  text: {
    noRunning: 'NO RUNNING. Nobody runs, for any card, at any point. No card rewards speed.',
    positionRule: 'Name one card in your hand. Land it by the whistle to double it. Declare it before your second completion to triple it. Fail and it is 800 against you. A VERSUS Position must be won, not merely completed.',
    vetoRule: 'A veto costs ten minutes frozen and blocks the next draw until it clears.',
    curseRule: 'One draw in six is a curse. Take the coins, then pay.',
    convertRule: 'A curse drawn late keeps its coins, but its time penalty becomes a flat 600 against you.',
    sweepRule: 'Clear every card before the whistle and play stops for you. The score banks and you take 1,500.',
    whistleRule: 'The whistle ends play. Dinner declares the winner, because VERSUS cards cannot be settled in the street.',
    dinnerIntro: 'Every VERSUS card both teams reached, side by side. Pick a winner for each, then declare.',
  },
};

export default content;
