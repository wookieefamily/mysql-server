// ===========================================================================
// HAMSTERDAM — ENGINE
// ===========================================================================
//
// Rules only. There is no card text, no coin value and no whistle time in this
// file — all of it is read from content.js. Swapping content changes the game
// without touching a line of this.
//
// Everything here is a pure function of (content, state, now). Mutating
// functions take a draft of the shared state and edit it in place; net.js
// re-runs them against freshly fetched state whenever a write loses a race, so
// they must be safe to apply twice. Each one starts by checking whether the
// thing it is about to do has already happened.

import { content } from './content.js';

export const SIDES = ['A', 'B'];

// --- Time ------------------------------------------------------------------

export function parseHM(hm) {
  const [h, m] = String(hm).split(':').map(Number);
  return h * 60 + m;
}

export function formatHM(mins) {
  const m = Math.max(0, Math.round(mins));
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function formatDuration(mins) {
  const m = Math.max(0, Math.round(mins));
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

// Game minutes -> real milliseconds. In the demo the clock runs at
// content.clock.speedFactor, so a ten minute freeze is 100 real seconds.
export function realMsForGameMinutes(gameMinutes) {
  return (gameMinutes * 60000) / content.clock.speedFactor;
}

export function gameMinutesForRealMs(ms) {
  return (ms / 60000) * content.clock.speedFactor;
}

// The game clock at the moment START DAY was pressed. Fixed in the demo so a
// day is a predictable length; the real build reads the actual time of day,
// which is why opening earlier gives you a longer day.
export function startMinutesNow(nowEpoch = Date.now()) {
  if (content.clock.fixedStart != null) return parseHM(content.clock.fixedStart);
  const d = new Date(nowEpoch);
  return d.getHours() * 60 + d.getMinutes();
}

export function gameNow(dayState, nowEpoch = Date.now()) {
  if (!dayState || !dayState.startedAt) return null;
  return dayState.startMinutes + gameMinutesForRealMs(nowEpoch - dayState.startedAt);
}

// --- Day lookups -----------------------------------------------------------

export function dayDef(dayId) {
  return content.days.find((d) => d.id === Number(dayId));
}

export function cardTypeOf(card) {
  return content.cardTypes[card.type];
}

export function isVersus(card) {
  return !!cardTypeOf(card).versus;
}

export function isTimeSink(card) {
  return (card.tags || []).includes('timeSink');
}

export function loserShare(card) {
  // Ninety minutes for a quarter would be unrecoverable, so TIME SINK pays more.
  return isTimeSink(card) ? content.rules.timeSinkLoserShare : content.rules.versusLoserShare;
}

// A card carrying a linkedFlag appears on two days and is removed from the
// later one once it has been found. The flag stores the day it was found on,
// so nobody has to remember at breakfast.
export function isRemoved(cardId, day, flags) {
  const card = content.cards[cardId];
  if (!card || !card.linkedFlag) return false;
  const foundOn = flags && flags[card.linkedFlag];
  return typeof foundOn === 'number' && foundOn < day.id;
}

export function liveCardIds(day, flags) {
  return day.sequence
    .filter((e) => e.kind === 'card' && !isRemoved(e.id, day, flags))
    .map((e) => e.id);
}

// --- State construction ----------------------------------------------------

export function newTeamState(offset) {
  return {
    offset,
    drawn: 0,          // how many sequence entries this team has consumed
    hand: [],          // absolute sequence indices
    done: [],
    vetoed: [],
    failed: [],        // AUTO-VETO cards that ran out of attempts. No penalty.
    attemptLog: [],    // [{ id, cardId, by, at }] — id makes a retry safe
    evidence: {},      // { [cardId]: { [item]: true } }
    curses: [],
    discarded: [],
    freezeUntil: null, // real epoch ms
    oneCardUntil: null,
    pendingBlank: false,
    halfPending: false,
    position: null,
    swept: false,
    sweptAt: null,
  };
}

// Bumped whenever the stored shape gains a field. See migrateState.
export const SCHEMA = 2;

export function newState() {
  return {
    schema: SCHEMA,
    build: content.build,
    setup: { day1PairingId: null },
    days: {},
    flags: {},
    photos: [],
  };
}

// The shared document outlives every deploy — that is the whole point of it. So
// a build has to be able to read a document written by an older build without
// falling over, and the place to deal with that is once, here, on the way in.
//
// Learned the hard way: a new build read fields an old document did not have,
// threw inside render(), and left four phones showing a screen that ignored
// every tap.
export function migrateState(state) {
  if (!state || typeof state !== 'object') return newState();

  state.schema = SCHEMA;
  state.build = state.build || content.build;
  state.setup = state.setup || { day1PairingId: null };
  state.flags = state.flags || {};
  state.photos = Array.isArray(state.photos) ? state.photos : [];
  state.days = state.days || {};

  for (const key of Object.keys(state.days)) {
    const ds = state.days[key];
    if (!ds || typeof ds !== 'object') { delete state.days[key]; continue; }

    ds.standing = ds.standing || {};
    ds.dinner = ds.dinner || {};
    ds.dinner.verdicts = ds.dinner.verdicts || {};
    ds.dinner.superlatives = ds.dinner.superlatives || [];
    ds.dinner.declared = !!ds.dinner.declared;

    // Find My used to be a pair of counters. Turn them into log entries so the
    // looks already taken still cost what they cost.
    if (!Array.isArray(ds.findMyLog)) {
      const counters = ds.findMy || {};
      ds.findMyLog = [];
      for (const side of SIDES) {
        for (let i = 0; i < (counters[side] || 0); i += 1) {
          ds.findMyLog.push({ id: `legacy-${side}-${i}`, side, by: null, at: ds.startedAt || 0 });
        }
      }
    }
    delete ds.findMy;

    ds.teams = ds.teams || {};
    for (const side of SIDES) {
      const t = ds.teams[side] || (ds.teams[side] = newTeamState(0));
      for (const list of ['hand', 'done', 'vetoed', 'curses', 'discarded', 'failed', 'attemptLog']) {
        if (!Array.isArray(t[list])) t[list] = [];
      }
      if (!t.evidence || typeof t.evidence !== 'object') t.evidence = {};
      if (typeof t.offset !== 'number') t.offset = 0;
      if (typeof t.drawn !== 'number') t.drawn = t.hand.length;
      // Older entries in standing logs have no id; give them one so the
      // duplicate-tap guard has something to compare against.
      for (const fires of Object.values(ds.standing)) {
        if (!Array.isArray(fires)) continue;
        fires.forEach((f, i) => { if (f && !f.id) f.id = `legacy-${i}`; });
      }
    }
  }
  return state;
}

// A phone running an older build should say so rather than quietly misbehave.
export function isFromNewerBuild(state) {
  return !!state && typeof state.schema === 'number' && state.schema > SCHEMA;
}

// Escape hatches. Gated on content.allowReset so a real afternoon cannot be
// wiped by a mis-tap.
export function resetDay(state, day) {
  delete state.days[day.id];
  ensureDay(state, day);
  return { ok: true };
}

export function resetAll(state) {
  const fresh = newState();
  for (const key of Object.keys(state)) delete state[key];
  Object.assign(state, fresh);
  return { ok: true };
}

export function pairingForDay(state, day) {
  if (day.pairing === 'fixed') return content.fixedPairing;
  const chosenId = state.setup && state.setup.day1PairingId;
  if (!chosenId) return null;
  const chosen = content.choosablePairings.find((p) => p.id === chosenId);
  if (day.pairing === 'choice') return chosen;
  // 'remainder' — the one Day 1 did not take. With exactly two choosable
  // pairings, picking one assigns the other. It cannot be the same pairing
  // twice and it cannot leave one unused.
  return content.choosablePairings.find((p) => p.id !== chosenId) || null;
}

export function ensureDay(state, day) {
  if (!state.days[day.id]) {
    state.days[day.id] = {
      startedAt: null,
      startMinutes: null,
      teams: { A: newTeamState(0), B: newTeamState(day.offsetB || 0) },
      standing: {},
      // A log rather than a counter, so a write that loses a race and gets
      // re-applied cannot count the same look twice.
      findMyLog: [],   // [{ id, side, by, at }]
      dinner: { verdicts: {}, superlatives: [], declared: false },
    };
  }
  return state.days[day.id];
}

// --- Derived status --------------------------------------------------------

export function whistleMinutes(day) {
  return parseHM(day.whistle);
}

export function isAfterWhistle(day, dayState, nowEpoch = Date.now()) {
  const g = gameNow(dayState, nowEpoch);
  return g != null && g >= whistleMinutes(day);
}

export function zonesLiftAt(dayState) {
  if (!dayState || dayState.startMinutes == null) return null;
  return dayState.startMinutes + content.rules.zoneLiftMinutes;
}

export function zonesOpen(day, dayState, nowEpoch = Date.now()) {
  if (!day.zones) return true;
  const g = gameNow(dayState, nowEpoch);
  const lift = zonesLiftAt(dayState);
  return g == null || lift == null ? false : g >= lift;
}

export function isFrozen(team, nowEpoch = Date.now()) {
  return !!team.freezeUntil && nowEpoch < team.freezeUntil;
}

export function freezeRemainingGameMinutes(team, nowEpoch = Date.now()) {
  if (!isFrozen(team, nowEpoch)) return 0;
  return gameMinutesForRealMs(team.freezeUntil - nowEpoch);
}

export function oneCardActive(team, nowEpoch = Date.now()) {
  return !!team.oneCardUntil && nowEpoch < team.oneCardUntil;
}

// How many cards this team may hold right now. The 'oneCard' curse squeezes
// this to one; cards already in hand are suspended rather than lost, and come
// back when it lifts.
export function handTarget(team, nowEpoch = Date.now()) {
  return oneCardActive(team, nowEpoch) ? 1 : content.rules.handSize;
}

export function activeHand(team, nowEpoch = Date.now()) {
  return team.hand.slice(0, handTarget(team, nowEpoch));
}

export function suspendedHand(team, nowEpoch = Date.now()) {
  return team.hand.slice(handTarget(team, nowEpoch));
}

// Effects that only change what the players may do, not what the app computes.
export function displayEffects(team, nowEpoch = Date.now()) {
  const out = [];
  for (const rec of team.curses) {
    if (rec.converted) continue;
    const curse = content.curses[rec.curseId];
    const e = curse.effect;
    if (e.kind !== 'noMaps' && e.kind !== 'onFoot' && e.kind !== 'drain') continue;
    const until = rec.at + realMsForGameMinutes(e.minutes);
    if (nowEpoch < until) {
      out.push({
        curseId: rec.curseId,
        title: curse.title,
        kind: e.kind,
        remaining: gameMinutesForRealMs(until - nowEpoch),
      });
    }
  }
  return out;
}

// --- Drawing ---------------------------------------------------------------

function fireCurse(day, team, absIndex, entry, nowEpoch, atGameMinutes) {
  const curse = content.curses[entry.id];
  // Any curse drawn after the cutoff keeps its coins but its time penalty
  // becomes a flat coin loss. Otherwise it is correct to hope for a curse in
  // the last twenty minutes, and it should never be correct to hope for one.
  const converted = atGameMinutes >= parseHM(day.convertAt);
  team.curses.push({
    i: absIndex,
    curseId: entry.id,
    at: nowEpoch,
    gameAt: atGameMinutes,
    converted,
  });
  if (converted) return;

  const e = curse.effect;
  if (e.kind === 'freeze') {
    team.freezeUntil = nowEpoch + realMsForGameMinutes(e.minutes);
  } else if (e.kind === 'blank') {
    team.pendingBlank = true;
    team.freezeUntil = nowEpoch + realMsForGameMinutes(e.minutes);
  } else if (e.kind === 'half') {
    team.halfPending = true;
  } else if (e.kind === 'oneCard') {
    team.oneCardUntil = nowEpoch + realMsForGameMinutes(e.minutes);
  }
  // toll, drain, noMaps and onFoot are settled at scoring or simply displayed.
}

// Fill the hand back up to its target, firing any curses drawn on the way.
// Safe to call repeatedly: it stops as soon as the hand is full, the deck is
// spent, the team is frozen, or the whistle has gone.
export function refill(day, dayState, side, flags, nowEpoch = Date.now()) {
  const team = dayState.teams[side];
  if (team.swept) return;
  if (isAfterWhistle(day, dayState, nowEpoch)) return;

  const L = day.sequence.length;
  let guard = 0;
  while (guard++ < L + 1) {
    if (isFrozen(team, nowEpoch)) return;           // a veto or a curse blocks the draw
    if (team.hand.length >= handTarget(team, nowEpoch)) return;
    if (team.drawn >= L) return;                    // deck spent

    const abs = (team.offset + team.drawn) % L;
    team.drawn += 1;
    const entry = day.sequence[abs];
    const at = gameNow(dayState, nowEpoch);

    if (entry.kind === 'curse') {
      fireCurse(day, team, abs, entry, nowEpoch, at);
      continue;                                     // a curse does not occupy a hand slot
    }
    if (isRemoved(entry.id, day, flags)) continue;  // found on an earlier day
    if (team.pendingBlank) {                        // discarded unseen
      team.pendingBlank = false;
      team.discarded.push({ i: abs, at, cardId: entry.id });
      continue;
    }
    team.hand.push(abs);
  }
}

// --- Actions (mutate a draft; safe to re-apply) -----------------------------

export function startDay(state, day, nowEpoch = Date.now()) {
  const ds = ensureDay(state, day);
  if (ds.startedAt) return ds;                      // already started, do nothing
  ds.startedAt = nowEpoch;
  ds.startMinutes = startMinutesNow(nowEpoch);
  for (const side of SIDES) refill(day, ds, side, state.flags, nowEpoch);
  return ds;
}

export function completeCard(state, day, side, absIndex, by, nowEpoch = Date.now()) {
  const ds = ensureDay(state, day);
  const team = ds.teams[side];
  if (team.done.some((d) => d.i === absIndex)) return;   // both phones tapped it
  if (!team.hand.includes(absIndex)) return;             // not in hand any more
  if (isAfterWhistle(day, ds, nowEpoch)) return;

  const entry = day.sequence[absIndex];
  const card = content.cards[entry.id];
  team.done.push({
    i: absIndex,
    cardId: entry.id,
    at: nowEpoch,
    gameAt: gameNow(ds, nowEpoch),
    half: !!team.halfPending,
    by,
  });
  if (team.halfPending) team.halfPending = false;
  team.hand = team.hand.filter((i) => i !== absIndex);

  // The card that appears on two days: record which day found it, so it is
  // removed from the later deck without anyone having to remember.
  if (card.linkedFlag && state.flags[card.linkedFlag] == null) {
    state.flags[card.linkedFlag] = day.id;
  }

  refill(day, ds, side, state.flags, nowEpoch);
  checkSweep(state, day, side, nowEpoch);
}

export function vetoCard(state, day, side, absIndex, by, nowEpoch = Date.now()) {
  const ds = ensureDay(state, day);
  const team = ds.teams[side];
  if (team.vetoed.some((v) => v.i === absIndex)) return;
  if (!team.hand.includes(absIndex)) return;
  if (isAfterWhistle(day, ds, nowEpoch)) return;

  team.vetoed.push({
    i: absIndex,
    cardId: day.sequence[absIndex].id,
    at: nowEpoch,
    gameAt: gameNow(ds, nowEpoch),
    by,
  });
  team.hand = team.hand.filter((i) => i !== absIndex);
  // Ten minutes frozen, and the next draw is blocked until it clears.
  team.freezeUntil = nowEpoch + realMsForGameMinutes(content.rules.vetoFreezeMinutes);
}

// Called on a tick once a freeze has run out, so the blocked draw arrives.
export function releaseFreeze(state, day, side, nowEpoch = Date.now()) {
  const ds = ensureDay(state, day);
  const team = ds.teams[side];
  if (isFrozen(team, nowEpoch)) return;
  if (team.freezeUntil) team.freezeUntil = null;
  refill(day, ds, side, state.flags, nowEpoch);
  checkSweep(state, day, side, nowEpoch);
}

export function canDeclarePosition(dayState, side, absIndex) {
  const team = dayState.teams[side];
  if (team.position) return { ok: false, why: 'Already declared today.' };
  if (team.done.some((d) => d.i === absIndex)) {
    return { ok: false, why: 'You have already completed that card.' };
  }
  if (!team.hand.includes(absIndex)) return { ok: false, why: 'That card is not in your hand.' };
  return { ok: true };
}

export function declarePosition(state, day, side, absIndex, by, nowEpoch = Date.now()) {
  const ds = ensureDay(state, day);
  const team = ds.teams[side];
  const check = canDeclarePosition(ds, side, absIndex);
  if (!check.ok) return check;
  team.position = {
    i: absIndex,
    cardId: day.sequence[absIndex].id,
    at: nowEpoch,
    gameAt: gameNow(ds, nowEpoch),
    // Declared before the team's second completion — while they have seen
    // almost nothing. Information-based, not clock-based.
    triple: team.done.length < 2,
    by,
  };
  return { ok: true };
}

export function checkSweep(state, day, side, nowEpoch = Date.now()) {
  const ds = ensureDay(state, day);
  const team = ds.teams[side];
  if (team.swept) return;
  const live = liveCardIds(day, state.flags);
  // Completed, or beaten after its last attempt. A card you chose to veto still
  // blocks the sweep; a card that ran you out of attempts does not, because
  // failing an AUTO-VETO is not a choice and is expected.
  const resolved = new Set([
    ...team.done.map((d) => d.cardId),
    ...(team.failed || []).map((f) => f.cardId),
  ]);
  if (live.length > 0 && live.every((id) => resolved.has(id))) {
    team.swept = true;
    team.sweptAt = nowEpoch;
    team.hand = [];
  }
}

// Every appending action carries an id minted once at the tap. A write that
// loses a compare-and-swap race is re-applied against fresh state, and without
// the id that would count the same tap twice.
export function logStanding(state, day, mechanicId, buttonId, by, opId, nowEpoch = Date.now()) {
  const ds = ensureDay(state, day);
  const mech = content.standingMechanics.find((m) => m.id === mechanicId);
  if (!mech) return { ok: false, why: 'Unknown mechanic.' };
  const list = ds.standing[mechanicId] || (ds.standing[mechanicId] = []);
  if (list.some((f) => f.id === opId)) return { ok: true };
  if (mech.dailyLimit != null && list.length >= mech.dailyLimit) {
    return { ok: false, why: 'Already fired today.' };
  }
  list.push({ id: opId, buttonId, by, at: nowEpoch });
  return { ok: true };
}

export function logFindMy(state, day, side, by, opId, nowEpoch = Date.now()) {
  const ds = ensureDay(state, day);
  ds.findMyLog = ds.findMyLog || [];
  if (ds.findMyLog.some((f) => f.id === opId)) return { ok: true };
  ds.findMyLog.push({ id: opId, side, by, at: nowEpoch });
  return { ok: true };
}

export function findMyCount(dayState, side) {
  return (dayState.findMyLog || []).filter((f) => f.side === side).length;
}

// --- AUTO-VETO attempts ----------------------------------------------------
//
// "Limited attempts, no penalty for failure, usually fails." The card used to
// print its attempt count and nothing counted them.

export function attemptsUsed(team, cardId) {
  return (team.attemptLog || []).filter((a) => a.cardId === cardId).length;
}

export function attemptsLeft(team, card, cardId) {
  if (!card.attempts) return null;
  return Math.max(0, card.attempts - attemptsUsed(team, cardId));
}

export function logAttempt(state, day, side, absIndex, by, opId, nowEpoch = Date.now()) {
  const ds = ensureDay(state, day);
  const team = ds.teams[side];
  const entry = day.sequence[absIndex];
  const card = content.cards[entry.id];
  if (!card || !card.attempts) return { ok: false, why: 'That card has no attempt limit.' };
  team.attemptLog = team.attemptLog || [];
  team.failed = team.failed || [];
  if (team.attemptLog.some((a) => a.id === opId)) return { ok: true };
  if (!team.hand.includes(absIndex)) return { ok: false, why: 'That card is not in your hand.' };
  if (isAfterWhistle(day, ds, nowEpoch)) return { ok: false, why: 'The whistle has gone.' };

  team.attemptLog.push({ id: opId, cardId: entry.id, by, at: nowEpoch });

  if (attemptsUsed(team, entry.id) >= card.attempts) {
    // Out of attempts. The card closes itself and the next one comes. No
    // penalty and no freeze — that is what AUTO-VETO means.
    team.failed.push({ i: absIndex, cardId: entry.id, at: nowEpoch, gameAt: gameNow(ds, nowEpoch) });
    team.hand = team.hand.filter((i) => i !== absIndex);
    refill(day, ds, side, state.flags, nowEpoch);
    checkSweep(state, day, side, nowEpoch);
    return { ok: true, closed: true };
  }
  return { ok: true };
}

// --- Evidence --------------------------------------------------------------
//
// A checklist, not a gate. The players are the authority on whether a card was
// done; this only stops arguments at dinner about what was owed.

export function setEvidence(state, day, side, cardId, item, on) {
  const ds = ensureDay(state, day);
  const team = ds.teams[side];
  team.evidence = team.evidence || {};
  const bag = team.evidence[cardId] || (team.evidence[cardId] = {});
  if (on) bag[item] = true; else delete bag[item];
  return { ok: true };
}

export function evidenceFor(team, cardId) {
  return (team.evidence || {})[cardId] || {};
}

// --- What a card is actually worth to you, right now -----------------------
//
// One function, used by the card and by the ledger, so the number on the card
// and the number in the ledger can never disagree.
export function cardPayout(day, dayState, side, cardId, opts = {}) {
  const card = content.cards[cardId];
  const team = dayState.teams[side];
  const versus = isVersus(card);
  // For a completed card the halving is whatever was true at completion; for a
  // card still in hand it is whatever is hanging over the team now.
  const halved = opts.half != null ? opts.half : team.halfPending;
  const factor = halved ? 0.5 : 1;

  const pos = team.position;
  const isPosition = !!pos && pos.cardId === cardId;
  const mult = isPosition
    ? (pos.triple ? content.rules.positionTriple : content.rules.positionDouble)
    : 1;

  return {
    versus,
    halved,
    isPosition,
    mult,
    base: card.value,
    // What the card is worth on completion before any Position bet — this is
    // the number printed large on the card.
    face: Math.round(card.value * factor),
    // Winning a VERSUS, or simply completing anything else, bet included.
    win: Math.round(card.value * factor * mult),
    // The loser's share is not multiplied — a Position that loses the judgment
    // has failed, and takes the penalty on top.
    lose: versus ? Math.round(card.value * factor * loserShare(card)) : null,
    losePct: versus ? Math.round(loserShare(card) * 100) : null,
    failPenalty: isPosition ? content.rules.positionFailPenalty : 0,
  };
}

// Has the other team already banked this card? Null when the day hides it —
// Day 3 is same-ground with interference allowed, and showing their hand would
// remove everything there is to bluff about.
export function opponentBanked(day, dayState, side, cardId) {
  if (!day.showOpponentProgress) return null;
  const other = side === 'A' ? 'B' : 'A';
  return dayState.teams[other].done.some((d) => d.cardId === cardId);
}

export function setVerdict(state, day, cardId, side) {
  const ds = ensureDay(state, day);
  ds.dinner.verdicts[cardId] = side;
}

export function addSuperlative(state, day, player, text) {
  const ds = ensureDay(state, day);
  ds.dinner.superlatives.push({ player, text, at: Date.now() });
}

// --- Scoring ---------------------------------------------------------------
//
// Every number below comes from content.js. Change a value there and the ledger
// changes, with no code edit and no redeploy of the function.

function positionMultiplier(position) {
  return position.triple ? content.rules.positionTriple : content.rules.positionDouble;
}

// Did the declared Position land? A VERSUS Position must be won, not merely
// completed — losing the judgment counts as failing it.
//
// It fails BY THE WHISTLE, not the moment it is declared. Until then it is
// simply open, and the penalty must not appear in the ledger — a team that has
// just declared has not lost 800, it has staked it.
export function positionOutcome(dayState, side, day, nowEpoch = Date.now()) {
  const team = dayState.teams[side];
  if (!team.position) return null;
  const pos = team.position;
  const card = content.cards[pos.cardId];
  const completed = team.done.some((d) => d.i === pos.i);
  if (!completed) {
    return isAfterWhistle(day, dayState, nowEpoch)
      ? { state: 'failed', reason: 'Not completed by the whistle.' }
      : { state: 'open', reason: 'Staked. Not landed yet.' };
  }
  if (isVersus(card)) {
    const verdict = dayState.dinner.verdicts[pos.cardId];
    if (!verdict) return { state: 'pending', reason: 'Waiting on the judgment.' };
    if (verdict !== side) return { state: 'failed', reason: 'Completed, but lost the judgment.' };
  }
  return { state: 'landed' };
}

export function scoreTeam(day, dayState, side, state, nowEpoch = Date.now()) {
  const team = dayState.teams[side];
  const other = side === 'A' ? 'B' : 'A';
  const verdicts = dayState.dinner.verdicts;
  const lines = [];
  let pending = 0;

  const pos = team.position;
  const posOutcome = positionOutcome(dayState, side, day, nowEpoch);

  for (const entry of team.done) {
    const card = content.cards[entry.cardId];
    // Same function the card itself prints from.
    const pay = cardPayout(day, dayState, side, entry.cardId, { half: entry.half });
    const notes = [];
    if (pay.halved) notes.push('half');

    if (pay.versus) {
      const verdict = verdicts[entry.cardId];
      if (!verdict) {
        pending += 1;
        lines.push({
          label: card.title, value: 0, pending: true,
          note: 'pending at dinner', cardId: entry.cardId,
        });
        continue;
      }
      if (verdict !== side) {
        notes.push(`loser ${pay.losePct}%`);
        lines.push({
          label: card.title, value: pay.lose, note: notes.join(', '), cardId: entry.cardId,
        });
        continue;
      }
    }

    // Won it, or it was never contested. The Position multiplier only lands
    // here, which is why cardPayout folds it into `win` and not into `lose`.
    const landed = pay.isPosition && posOutcome && posOutcome.state === 'landed';
    if (landed) notes.push(`Position ×${pay.mult}`);
    lines.push({
      label: card.title,
      value: landed ? pay.win : Math.round(pay.win / pay.mult),
      note: notes.join(', '),
      cardId: entry.cardId,
    });
  }

  for (const entry of team.failed || []) {
    lines.push({
      label: content.cards[entry.cardId].title,
      value: 0,
      note: 'out of attempts — no penalty',
    });
  }

  if (pos && posOutcome && posOutcome.state === 'failed') {
    lines.push({
      label: `Position failed — ${content.cards[pos.cardId].title}`,
      value: content.rules.positionFailPenalty,
      note: posOutcome.reason,
      loss: true,
    });
  }

  const clock = gameNow(dayState, nowEpoch);
  const capped = clock == null ? null : Math.min(clock, whistleMinutes(day));

  for (const rec of team.curses) {
    const curse = content.curses[rec.curseId];
    lines.push({ label: curse.title, value: curse.value, note: 'curse', curse: true });

    if (rec.converted) {
      lines.push({
        label: `${curse.title} — late`,
        value: content.rules.lateCurseFlatPenalty,
        note: 'time penalty converted',
        loss: true, curse: true,
      });
      continue;
    }
    const e = curse.effect;
    if (e.kind === 'toll') {
      lines.push({ label: `${curse.title} — paid`, value: -e.amount, note: `to the other team`, loss: true, curse: true });
    } else if (e.kind === 'drain' && capped != null) {
      const elapsed = Math.max(0, Math.min(capped - rec.gameAt, e.minutes));
      const ticks = Math.floor(elapsed / e.everyMinutes);
      if (ticks > 0) {
        lines.push({
          label: `${curse.title} — dripping`,
          value: -ticks * e.amount,
          note: `${ticks} × ${e.amount}`,
          loss: true, curse: true,
        });
      }
    }
  }

  // The other team's toll lands here as a gain.
  for (const rec of dayState.teams[other].curses) {
    if (rec.converted) continue;
    const curse = content.curses[rec.curseId];
    if (curse.effect.kind === 'toll') {
      lines.push({ label: `${curse.title} — received`, value: curse.effect.amount, note: 'from the other team' });
    }
  }

  if (day.findMy && day.findMy.enabled && day.findMy.cost > 0) {
    const looks = findMyCount(dayState, side);
    if (looks > 0) {
      lines.push({
        label: `${day.findMy.label} × ${looks}`,
        value: -looks * day.findMy.cost,
        note: `${day.findMy.cost} a look`,
        loss: true,
      });
    }
  }

  const pairing = pairingForDay(state, day);
  for (const mech of content.standingMechanics) {
    const fires = dayState.standing[mech.id] || [];
    for (const fire of fires) {
      const button = mech.buttons.find((b) => b.id === fire.buttonId);
      if (!button) continue;
      const playerSide = pairing
        ? (pairing.A.members.includes(mech.player) ? 'A' : 'B')
        : 'A';
      const creditSide = button.credit === 'other'
        ? (playerSide === 'A' ? 'B' : 'A')
        : playerSide;
      if (creditSide !== side) continue;
      lines.push({
        label: `${mech.title} — ${button.label}`,
        value: button.value,
        note: 'standing',
        loss: button.value < 0,
      });
    }
  }

  if (team.swept) {
    lines.push({ label: 'Clean sweep', value: content.rules.cleanSweepBonus, note: 'deck cleared' });
  }

  const banked = lines.reduce((sum, l) => sum + (l.pending ? 0 : l.value), 0);
  return { lines, banked: Math.round(banked), pending };
}

export function scoreBoth(day, dayState, state, nowEpoch = Date.now()) {
  return {
    A: scoreTeam(day, dayState, 'A', state, nowEpoch),
    B: scoreTeam(day, dayState, 'B', state, nowEpoch),
  };
}

// Every VERSUS card that at least one team completed and that has not been
// judged yet. This is what dinner mode is for: they cannot be settled in the
// street.
export function pendingVersus(day, dayState) {
  const out = [];
  const seen = new Set();
  for (const side of SIDES) {
    for (const entry of dayState.teams[side].done) {
      const card = content.cards[entry.cardId];
      if (!isVersus(card) || seen.has(entry.cardId)) continue;
      seen.add(entry.cardId);
      out.push({
        cardId: entry.cardId,
        card,
        reachedBy: SIDES.filter((s) => dayState.teams[s].done.some((d) => d.cardId === entry.cardId)),
        verdict: dayState.dinner.verdicts[entry.cardId] || null,
      });
    }
  }
  // Keep them in deck order so dinner reads like the day did.
  const order = day.sequence.map((e) => e.id);
  out.sort((a, b) => order.indexOf(a.cardId) - order.indexOf(b.cardId));
  return out;
}

// "No. 4 of 14" — a card's place among the cards, ignoring the curses that sit
// between them. Both teams share one sequence, so this means the same to both.
export function cardOrdinals(day, flags) {
  const map = {};
  liveCardIds(day, flags).forEach((id, i) => { map[id] = i + 1; });
  return map;
}

// The two pairings that Days 1 and 2 share out. With four players there are
// exactly three ways to make two pairs; Day 3 takes one, so these two are what
// remain — which means everybody partners everybody else exactly once across
// the three days. Which of the two falls on Day 1 is a coin flip, not a choice.
export function flipDay1Pairing(rand = Math.random()) {
  const options = content.choosablePairings;
  return options[Math.floor(rand * options.length) % options.length].id;
}

export function setDay1Pairing(state, pairingId) {
  // Never overwrite. Two phones tapping flip at once must agree, and nobody
  // gets to roll it again because they did not like it.
  if (state.setup.day1PairingId) {
    return { ok: false, why: 'Already flipped. It stands.' };
  }
  state.setup.day1PairingId = pairingId;
  return { ok: true };
}

export function deckProgress(day, dayState, side, flags) {
  const live = liveCardIds(day, flags);
  const team = dayState.teams[side];
  const doneIds = new Set(team.done.map((d) => d.cardId));
  return { done: live.filter((id) => doneIds.has(id)).length, total: live.length };
}
