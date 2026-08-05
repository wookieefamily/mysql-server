// ===========================================================================
// HAMSTERDAM — APP
// ===========================================================================
//
// Screens and wiring. No card text, no coin values and no rules live here —
// everything printed comes from content.js and everything decided comes from
// engine.js.

import { content } from './content.js';
import * as E from './engine.js';
import * as Net from './net.js';

const KEY_PLAYER = 'hamsterdam.player';
const KEY_DAY = 'hamsterdam.day';

let me = localStorage.getItem(KEY_PLAYER) || null;
let unlocked = content.password == null;
let dayId = Number(localStorage.getItem(KEY_DAY)) || content.days[0].id;
let tab = 'play';
let flash = null;
let flashUntil = 0;
let busy = false;
let lastSignature = '';
let releasing = false;

const app = document.getElementById('app');
const nav = document.getElementById('nav');
const bannerEl = document.getElementById('banner');

// --- Small helpers ---------------------------------------------------------

const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const coins = (n) => {
  const v = Math.round(n);
  return (v < 0 ? '−' : '') + Math.abs(v).toLocaleString('en-GB');
};

// Minted once per tap. Every appending action carries one, so a write that
// loses a compare-and-swap race and gets re-applied cannot count twice.
const opId = () =>
  (crypto.randomUUID ? crypto.randomUUID()
    : `op${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`);

function say(msg) {
  flash = msg;
  flashUntil = Date.now() + 4000;
  render();
}

const currentDay = () => E.dayDef(dayId);

function mySide(state, day) {
  const pairing = E.pairingForDay(state, day);
  if (!pairing || !me) return null;
  if (pairing.A.members.includes(me)) return 'A';
  if (pairing.B.members.includes(me)) return 'B';
  return null;
}

function teamNames(state, day) {
  const pairing = E.pairingForDay(state, day);
  return pairing ? { A: pairing.A.name, B: pairing.B.name } : { A: 'Team A', B: 'Team B' };
}

const playerName = (id) => {
  const p = content.players.find((x) => x.id === id);
  return p ? p.name : id;
};

async function act(fn) {
  if (busy) return;
  busy = true;
  render();
  try {
    const result = await fn();
    if (result && result.ok === false && result.why) say(result.why);
  } catch (err) {
    say(String(err.message || err));
  } finally {
    busy = false;
    render();
  }
}

// --- Card ------------------------------------------------------------------

// Card type is a full-bleed coloured band, so you know what a card is before
// reading a word of it.
function typeBar(card) {
  const chipClass = { VERSUS: 'solid', SOLO: 'green', AUTO_VETO: '' }[card.type] ?? '';
  const out = [`<span class="chip ${chipClass}">${esc(E.cardTypeOf(card).label)}</span>`];
  for (const tagId of card.tags || []) {
    const tag = content.cardTags[tagId];
    if (!tag) continue;
    const cls = tagId === 'timeSink' ? 'ochre' : 'blue';
    const extra = tagId === 'timeSink' && card.minutes ? ` · ${card.minutes} min` : '';
    out.push(`<span class="chip ${cls}">${esc(tag.label)}${extra}</span>`);
  }
  return `<div class="typebar">${out.join('')}</div>`;
}

// What the card pays YOU, right now — not the number that was printed on it.
function payoutRows(card, pay) {
  const rows = [];
  if (pay.halved) {
    rows.push(`<div class="payout mod"><span class="win">Half is on you</span>
      <span class="lead"></span><span class="lose">was ${coins(pay.base)}</span></div>`);
  }
  if (pay.isPosition) {
    rows.push(`<div class="payout mod"><span class="win">Position ×${pay.mult}</span>
      <span class="lead"></span><span class="lose">${coins(pay.win)} if you land it</span></div>`);
  }
  if (pay.versus) {
    rows.push(`<div class="payout"><span class="win">Win ${coins(pay.face)}</span>
      <span class="lead"></span><span class="lose">Lose ${coins(pay.lose)}</span></div>`);
  } else if (card.type === 'AUTO_VETO') {
    rows.push(`<div class="payout"><span class="win">Both teams may score</span>
      <span class="lead"></span><span class="lose">No penalty</span></div>`);
  } else {
    rows.push(`<div class="payout"><span class="win">Both teams may score</span>
      <span class="lead"></span><span class="lose">Fixed</span></div>`);
  }
  return rows.join('');
}

function evidenceBlock(card, team, cardId, disabled) {
  const list = card.evidence || [];
  if (!list.length) return '';
  const ticked = E.evidenceFor(team, cardId);
  return `<div class="evidence">Evidence
    <div class="row">
      ${list.map((item) => `
        <button class="box" data-act="evidence" data-card="${esc(cardId)}"
          data-item="${esc(item)}" data-on="${ticked[item] ? '0' : '1'}" ${disabled ? 'disabled' : ''}>
          <i class="b${ticked[item] ? ' on' : ''}"></i> ${esc(item)}
        </button>`).join('')}
    </div>
  </div>`;
}

function attemptsBlock(card, team, cardId) {
  if (!card.attempts) return '';
  const used = E.attemptsUsed(team, cardId);
  const left = Math.max(0, card.attempts - used);
  const marks = Array.from({ length: card.attempts }, (_, i) =>
    `<i class="${i < used ? 'used' : ''}"></i>`).join('');
  return `<div class="evidence">Attempts left
    <div class="row"><span class="box"><span class="tally">${marks}</span>
      <span style="margin-left:8px">${left} of ${card.attempts}</span></span></div>
  </div>`;
}

function cardMarkup(state, day, dayState, side, absIndex, opts = {}) {
  const entry = day.sequence[absIndex];
  const card = content.cards[entry.id];
  const team = dayState.teams[side];
  const now = Date.now();
  const frozen = E.isFrozen(team, now);
  const ended = E.isAfterWhistle(day, dayState, now);
  const disabled = frozen || ended || opts.suspended;

  const pay = E.cardPayout(day, dayState, side, entry.id);
  const ordinals = E.cardOrdinals(day, state.flags);
  const total = E.liveCardIds(day, state.flags).length;
  const oppBanked = E.opponentBanked(day, dayState, side, entry.id);
  const names = teamNames(state, day);
  const other = side === 'A' ? 'B' : 'A';

  const shots = state.photos.filter(
    (p) => p.dayId === day.id && p.cardId === entry.id && p.side === side);

  const timeNote = card.minutes && !ended
    ? `<p class="note" style="margin-top:9px">About ${card.minutes} minutes of the ${
        esc(E.formatDuration(E.whistleMinutes(day) - E.gameNow(dayState, now)))} you have left.</p>`
    : '';

  return `
  <article class="card">
    <div class="slug">
      <span>No. ${ordinals[entry.id] || '—'} of ${total}</span>
      <span>${opts.suspended ? 'Suspended' : 'In hand'}</span>
    </div>
    ${typeBar(card)}
    <div class="pad">
      <div class="cardhead">
        <h2 class="cardtitle">${esc(card.title)}</h2>
        <div class="price">${coins(pay.face)}</div>
      </div>
      <div class="pricerule"></div>
      ${payoutRows(card, pay)}
      <p class="body">${esc(card.body)}</p>
      ${oppBanked ? `<div class="opp">${esc(names[other])} have already banked this one</div>` : ''}
      ${timeNote}
      ${opts.suspended ? '<p class="note"><strong>Suspended.</strong> You hold one card only until the curse lifts.</p>' : ''}
      ${attemptsBlock(card, team, entry.id)}
      ${evidenceBlock(card, team, entry.id, disabled)}
      ${shots.length ? `<div class="shots">${shots.map((p) => `<img src="${esc(Net.photoUrl(p.id))}" alt="">`).join('')}</div>` : ''}
    </div>
    <div class="card-foot">
      <button class="primary grow" data-act="complete" data-i="${absIndex}" ${disabled ? 'disabled' : ''}>Complete</button>
      ${card.attempts
        ? `<button data-act="attempt" data-i="${absIndex}" ${disabled ? 'disabled' : ''}>Failed attempt</button>`
        : `<button data-act="veto" data-i="${absIndex}" ${disabled ? 'disabled' : ''}>Veto −${content.rules.vetoFreezeMinutes}m</button>`}
      <label class="btn file small">Photo
        <input type="file" accept="image/*" capture="environment"
               data-act="photo" data-card="${esc(entry.id)}" ${ended ? 'disabled' : ''}>
      </label>
      ${!team.position && !ended && !opts.suspended
        ? `<button class="small green" data-act="position" data-i="${absIndex}">Position</button>` : ''}
    </div>
  </article>`;
}

function curseMarkup(day, rec) {
  const curse = content.curses[rec.curseId];
  const e = curse.effect;
  const band = rec.converted
    ? `Curse · late — flat ${coins(content.rules.lateCurseFlatPenalty)}`
    : `Curse${e.minutes ? ` · ${e.minutes} min` : ''}`;
  return `
  <article class="card curse">
    <div class="slug"><span>Drawn ${esc(E.formatHM(rec.gameAt))}</span><span>Curse</span></div>
    <div class="typebar"><span class="chip red">${esc(band)}</span></div>
    <div class="pad">
      <div class="cardhead">
        <h2 class="cardtitle">${esc(curse.title)}</h2>
        <div class="price">${coins(curse.value)}</div>
      </div>
      <div class="pricerule"></div>
      <p class="body">${esc(curse.body)}</p>
      ${rec.converted ? `<p class="body">Drawn after ${esc(day.convertAt)}. It keeps its coins; the time penalty became a flat ${coins(content.rules.lateCurseFlatPenalty)}.</p>` : ''}
    </div>
  </article>`;
}

// --- The NOW band ----------------------------------------------------------
//
// One line, in priority order, answering "what do I do next". Never a countdown
// that implies moving faster — nobody runs.

function nowBand(state, day, dayState, side) {
  const team = dayState.teams[side];
  const now = Date.now();
  const left = content.rules.positionTriple;
  let tone = '';
  let text;

  if (E.isAfterWhistle(day, dayState, now)) {
    tone = 'warn';
    text = 'The whistle has gone. Play is over — dinner decides it.';
  } else if (team.swept) {
    tone = 'green';
    text = `Deck cleared. Play has stopped for you and ${coins(content.rules.cleanSweepBonus)} is banked.`;
  } else if (E.isFrozen(team, now)) {
    tone = 'warn';
    text = `Frozen — ${E.formatDuration(E.freezeRemainingGameMinutes(team, now))} to go. Sit down. No planning, no looking ahead.`;
  } else if (team.halfPending) {
    tone = 'warn';
    text = 'Half is on you — your next completed card is worth half. Spend it on something small.';
  } else if (!team.position && team.done.length < 2) {
    const togo = 2 - team.done.length;
    tone = 'green';
    text = `Position still open — declare now for ×${left}. ${togo} more completion${togo === 1 ? '' : 's'} and it drops to ×${content.rules.positionDouble}.`;
  } else if (day.zones && !E.zonesOpen(day, dayState, now)) {
    tone = 'green';
    text = `${day.zones[side]} until ${E.formatHM(E.zonesLiftAt(dayState))}.`;
  } else if (!team.hand.length && team.drawn >= day.sequence.length) {
    text = 'Deck spent. Nothing left to draw.';
  } else {
    const n = E.activeHand(team, now).length;
    text = `${n} in hand. Complete or veto one to draw the next.`;
  }

  const progress = E.deckProgress(day, dayState, side, state.flags);
  const totals = E.scoreTeam(day, dayState, side, state);
  const bits = [
    `<span><b>${progress.done}</b> of ${progress.total} done</span>`,
    totals.pending ? `<span><b>${totals.pending}</b> pending at dinner</span>` : '',
    team.vetoed.length ? `<span><b>${team.vetoed.length}</b> vetoed</span>` : '',
    team.failed.length ? `<span><b>${team.failed.length}</b> beat you</span>` : '',
    team.position
      ? `<span>Position ×${team.position.triple ? content.rules.positionTriple : content.rules.positionDouble}</span>`
      : '<span>Position open</span>',
  ].filter(Boolean).join('');

  return `<div class="now ${tone}"><span class="k">Now</span><span class="t">${esc(text)}</span></div>
    <div class="nowsub">${bits}</div>`;
}

// --- Screens ---------------------------------------------------------------

function screenGate() {
  if (content.password != null && !unlocked) {
    return `
    <div class="masthead"><div class="kicker"><span>${esc(content.build)}</span></div><h1>Hamsterdam</h1></div>
    <div class="block">
      <div class="label">Password</div>
      <input type="text" id="pw" autocomplete="off" autocapitalize="none" spellcheck="false">
      <div style="margin-top:12px"><button class="big primary" data-act="unlock">Enter</button></div>
    </div>`;
  }
  return `
  <div class="masthead">
    <div class="kicker"><span>${esc(content.build)}</span><span>Pick your player</span></div>
    <h1>Hamsterdam</h1>
    <div class="sub">Four phones, one game. Choose which one you are.</div>
  </div>
  <div class="block">
    <div class="picker">
      ${content.players.map((p) => `
        <button class="pick" data-act="pickme" data-id="${esc(p.id)}" aria-pressed="${me === p.id}">
          <span>${esc(p.name)}</span><span class="tick">${me === p.id ? 'You' : 'Choose'}</span>
        </button>`).join('')}
    </div>
    <p class="note" style="margin-top:14px">Stays on this phone. Change it any time from the day sheet.</p>
  </div>`;
}

function daySwitcher(state) {
  return `<div class="btn-row" style="margin-bottom:14px">
    ${content.days.map((d) => {
      const started = state.days[d.id] && state.days[d.id].startedAt;
      const current = d.id === dayId;
      return `<button class="small grow${current ? ' primary' : ''}" data-act="day" data-id="${d.id}"${current ? ' aria-current="true"' : ''}>Day ${esc(d.id)}${started ? ' ·' : ''}</button>`;
    }).join('')}
  </div>`;
}

function masthead(state, day) {
  const side = mySide(state, day);
  const names = teamNames(state, day);
  return `<div class="masthead">
    <div class="kicker"><span>${esc(day.label)} · ${esc(day.date)}</span><span>Whistle ${esc(day.whistle)}</span></div>
    <h1>Hamsterdam</h1>
    <div class="sub">${esc(day.demoPlace || day.place)}${side ? ` · ${esc(names[side])}` : ''}</div>
  </div>`;
}

// All three days at once, so it is obvious that everybody partners everybody
// else exactly once.
function pairingTable(state) {
  return `<table class="ledger">
    ${content.days.map((d) => {
      const p = E.pairingForDay(state, d);
      return `<tr>
        <td class="sub">${esc(d.label)}</td>
        <td>${p ? `${esc(p.A.name)}<br>v ${esc(p.B.name)}` : '<span class="pending-mark">waiting on the flip</span>'}</td>
      </tr>`;
    }).join('')}
  </table>`;
}

function screenStart(state, day) {
  const pairing = E.pairingForDay(state, day);
  const flipped = !!state.setup.day1PairingId;

  return `
  ${masthead(state, day)}
  ${daySwitcher(state)}

  <div class="now warn"><span class="k">Hard rule</span><span class="t">${esc(content.text.noRunning)}</span></div>
  <div style="height:14px"></div>

  <div class="block">
    <div class="label">Teams</div>
    <p class="note">Day Three is fixed: ${esc(content.fixedPairing.label)}. That leaves exactly two pairings
    for Days One and Two, so across the three days each of you partners each of the other three once.
    Which pairing falls on Day One is a coin flip.</p>

    ${flipped ? '' : `
      <div style="margin:14px 0">
        <button class="big primary" data-act="flip">Flip for Day One</button>
      </div>
      <p class="note center">All four phones will see the same result. It cannot be re-flipped.</p>`}

    <div style="margin-top:14px">${pairingTable(state)}</div>

    ${flipped
      ? '<p class="note" style="margin-top:10px">Flipped and locked.</p>'
      : `<details style="margin-top:12px"><summary class="tiny">Already flipped a real coin? Set it by hand</summary>
        <div class="picker" style="margin-top:10px">
          ${content.choosablePairings.map((p) => `
            <button class="pick" data-act="pairing" data-id="${esc(p.id)}">
              <span>${esc(p.A.name)}<br><span class="tiny">against ${esc(p.B.name)}</span></span>
              <span class="tick">Day 1</span>
            </button>`).join('')}
        </div></details>`}
  </div>

  <div class="block">
    <div class="label">The clock</div>
    <p class="note">Cards deal the moment you press start and the clock runs from then to the whistle at ${esc(day.whistle)}.
    ${content.clock.speedFactor !== 1
      ? `<strong>${esc(content.clock.note)}</strong> A full day plays through in about ${Math.round((E.parseHM(day.whistle) - E.parseHM(content.clock.fixedStart)) / content.clock.speedFactor)} minutes.`
      : ''}</p>
    <p class="note" style="margin-top:8px">Deck: ${E.liveCardIds(day, state.flags).length} cards.</p>
  </div>

  <hr class="hard-rule">
  <button class="big primary" data-act="start" ${!pairing || busy ? 'disabled' : ''}>Start ${esc(day.label)}</button>
  ${!pairing ? '<p class="note center" style="margin-top:10px">Flip for Day One first.</p>' : ''}`;
}

function scoreBoard(state, day, dayState) {
  const names = teamNames(state, day);
  const totals = E.scoreBoth(day, dayState, state);
  const side = mySide(state, day);
  return `<div class="scores">
    ${['A', 'divider', 'B'].map((s) => {
      if (s === 'divider') return '<div class="divider"></div>';
      const t = totals[s];
      return `<div class="score${side === s ? ' mine' : ''}">
        <div class="team-name">${esc(names[s])}</div>
        <span class="coin${t.banked < 0 ? ' neg' : ''}" data-coin="${s}" data-value="${t.banked}">${coins(t.banked)}</span>
        <div class="meta">${t.pending ? `${t.pending} pending` : 'settled'}</div>
      </div>`;
    }).join('')}
  </div>`;
}

function clockBar(day, dayState) {
  const now = Date.now();
  const g = E.gameNow(dayState, now);
  const whistle = E.whistleMinutes(day);
  const elapsed = g == null ? 0 : g - dayState.startMinutes;
  const left = g == null ? 0 : whistle - g;
  return `<div class="clockbar">
    <div><div class="k">Now</div><div class="v">${esc(E.formatHM(g == null ? 0 : g))}</div></div>
    <div class="c"><div class="k">Elapsed</div><div class="v">${esc(E.formatDuration(elapsed))}</div></div>
    <div class="r"><div class="k">Whistle ${esc(day.whistle)}</div><div class="v">${left <= 0 ? 'Gone' : esc(E.formatDuration(left))}</div></div>
  </div>`;
}

function screenPlay(state, day, dayState) {
  const side = mySide(state, day);
  const now = Date.now();
  if (!side) {
    return `${daySwitcher(state)}<div class="notice"><span class="k">Not on a team</span>
      You are not on a team for ${esc(day.label)}. Flip for the pairing on the start screen.</div>`;
  }
  const team = dayState.teams[side];
  const ended = E.isAfterWhistle(day, dayState, now);
  const recentCurse = team.curses.length ? team.curses[team.curses.length - 1] : null;
  const showCurse = recentCurse && (now - recentCurse.at) < E.realMsForGameMinutes(45);

  let body = '';

  if (ended) {
    body += `<button class="big primary" data-act="tab" data-id="dinner">Go to dinner</button>`;
  } else if (!team.swept) {
    for (const eff of E.displayEffects(team, now)) {
      body += `<div class="notice red"><span class="k">${esc(eff.title)}</span>
        ${E.formatDuration(eff.remaining)} remaining.</div>`;
    }
    if (showCurse) body += curseMarkup(day, recentCurse);

    const active = E.activeHand(team, now);
    const suspended = E.suspendedHand(team, now);
    if (!active.length && !suspended.length) {
      body += `<div class="notice"><span class="k">Hand empty</span>
        ${team.drawn >= day.sequence.length ? 'The deck is spent.' : 'Waiting on the freeze to clear.'}</div>`;
    }
    body += active.map((i) => cardMarkup(state, day, dayState, side, i)).join('');
    body += suspended.map((i) => cardMarkup(state, day, dayState, side, i, { suspended: true })).join('');
  }

  return `
  ${masthead(state, day)}
  ${daySwitcher(state)}
  ${scoreBoard(state, day, dayState)}
  ${clockBar(day, dayState)}
  ${nowBand(state, day, dayState, side)}
  ${body}`;
}

function screenCounters(state, day, dayState) {
  const side = mySide(state, day);
  const names = teamNames(state, day);
  const teamsKnown = !!E.pairingForDay(state, day);

  const findMy = day.findMy && day.findMy.enabled ? `
    <div class="block">
      <div class="label">Find My</div>
      <p class="note">${day.findMy.cost > 0
        ? `Legal, declared at dinner, ${coins(day.findMy.cost)} a look.`
        : 'Free and unlimited today. Nothing to log.'}</p>
      ${day.findMy.cost > 0 ? `
        <div class="spread" style="margin:10px 0">
          <span>${esc(names.A)}</span><span class="counter-count">${E.findMyCount(dayState, 'A')}</span>
        </div>
        <div class="spread" style="margin-bottom:10px">
          <span>${esc(names.B)}</span><span class="counter-count">${E.findMyCount(dayState, 'B')}</span>
        </div>
        <button class="grow" data-act="findmy" ${!side ? 'disabled' : ''}>Log a look — ${coins(-day.findMy.cost)}</button>` : ''}
    </div>` : '';

  return `
  ${masthead(state, day)}
  ${daySwitcher(state)}
  <div class="block">
    <div class="label">Standing mechanics</div>
    <p class="note">They fire when they fire. No card needs to be open and the day does not need to have started.</p>
  </div>
  ${content.standingMechanics.map((mech) => {
    const fires = dayState.standing[mech.id] || [];
    const spent = mech.dailyLimit != null && fires.length >= mech.dailyLimit;
    return `
    <div class="counter">
      <div class="counter-head">
        <span class="counter-title">${esc(mech.title)}</span>
        <span class="counter-count${spent ? ' spent' : ''}">${fires.length}${mech.dailyLimit != null ? ` / ${mech.dailyLimit}` : ''}</span>
      </div>
      <p class="note" style="margin:6px 0 10px">${esc(playerName(mech.player))}. ${esc(mech.note)}</p>
      <div class="btn-row">
        ${mech.buttons.map((b) => `
          <button class="small ${b.value < 0 ? 'danger' : ''} grow" data-act="standing"
            data-mech="${esc(mech.id)}" data-btn="${esc(b.id)}" ${spent || !teamsKnown ? 'disabled' : ''}>
            ${esc(b.label)} ${coins(b.value)}
          </button>`).join('')}
      </div>
    </div>`;
  }).join('')}
  ${findMy}
  ${!teamsKnown ? '<p class="note center" style="margin-top:14px">Flip for the pairing so these know which team to credit.</p>' : ''}`;
}

// The day sheet: what has actually happened, in the order it happened.
function recordCard(day, state, entry, kind, ordinals, total, verdicts) {
  if (kind === 'curse') {
    const curse = content.curses[entry.curseId];
    return `<article class="card curse">
      <div class="slug"><span>Drawn ${esc(E.formatHM(entry.gameAt))}</span><span>Curse</span></div>
      <div class="typebar"><span class="chip red">Curse${entry.converted ? ' · late' : ''}</span></div>
      <div class="pad">
        <h2 class="cardtitle">${esc(curse.title)}</h2>
        <div class="recordfoot"><div class="price">${coins(curse.value)}</div></div>
      </div>
    </article>`;
  }

  const card = content.cards[entry.cardId];
  const versus = E.isVersus(card);
  const verdict = verdicts[entry.cardId];
  let stamp = 'Completed';
  let stampCls = '';
  if (kind === 'vetoed') { stamp = 'Vetoed'; }
  else if (kind === 'failed') { stamp = 'Beat you'; }
  else if (versus && !verdict) { stamp = 'Pending'; stampCls = ' green'; }
  else if (versus && verdict) { stamp = verdict === entry.side ? 'Won' : 'Lost'; stampCls = verdict === entry.side ? ' green' : ''; }

  const who = entry.by ? ` · ${playerName(entry.by)}` : '';
  const shots = state.photos.filter((p) => p.dayId === day.id && p.cardId === entry.cardId && p.side === entry.side);

  return `<article class="card done${kind === 'vetoed' ? ' void' : ''}">
    <div class="slug"><span>No. ${ordinals[entry.cardId] || '—'} of ${total} · ${esc(E.formatHM(entry.gameAt))}${esc(who)}</span></div>
    ${typeBar(card)}
    <div class="pad">
      <h2 class="cardtitle">${esc(card.title)}</h2>
      <div class="recordfoot">
        <div class="price">${coins(kind === 'done' ? card.value : 0)}</div>
        <div class="stamp${stampCls}">${esc(stamp)}</div>
      </div>
      ${shots.length ? `<div class="shots">${shots.map((p) => `<img src="${esc(Net.photoUrl(p.id))}" alt="">`).join('')}</div>` : ''}
    </div>
  </article>`;
}

function screenLedger(state, day, dayState) {
  const names = teamNames(state, day);
  const totals = E.scoreBoth(day, dayState, state);
  const side = mySide(state, day) || 'A';
  const team = dayState.teams[side];
  const ordinals = E.cardOrdinals(day, state.flags);
  const total = E.liveCardIds(day, state.flags).length;

  const records = [
    ...team.done.map((e) => ({ ...e, side, kind: 'done' })),
    ...team.vetoed.map((e) => ({ ...e, side, kind: 'vetoed' })),
    ...team.failed.map((e) => ({ ...e, side, kind: 'failed' })),
    ...team.curses.map((e) => ({ ...e, side, kind: 'curse' })),
  ].sort((a, b) => a.at - b.at);

  return `
  ${masthead(state, day)}
  ${daySwitcher(state)}
  ${dayState.startedAt ? scoreBoard(state, day, dayState) : '<p class="note">Not started.</p>'}

  <div class="block">
    <div class="label">The day so far — ${esc(names[side])}</div>
    ${records.length
      ? records.map((r) => recordCard(day, state, r, r.kind, ordinals, total, dayState.dinner.verdicts)).join('')
      : '<p class="note">Nothing yet.</p>'}
  </div>

  ${E.SIDES.map((s) => `
    <div class="block">
      <div class="label">${esc(names[s])} — the count</div>
      <table class="ledger">
        ${totals[s].lines.length
          ? totals[s].lines.map((l) => `
            <tr>
              <td>${esc(l.label)}${l.note ? `<br><span class="sub">${esc(l.note)}</span>` : ''}</td>
              <td class="n ${l.loss || l.value < 0 ? 'loss' : ''} ${l.pending ? 'pending-mark' : ''}">
                ${l.pending ? 'pending' : coins(l.value)}
              </td>
            </tr>`).join('')
          : '<tr><td class="sub">Nothing yet</td><td class="n">0</td></tr>'}
        <tr><td><strong>Banked</strong></td><td class="n"><strong>${coins(totals[s].banked)}</strong></td></tr>
      </table>
    </div>`).join('')}

  <div class="block">
    <div class="label">This phone</div>
    <p class="note">You are ${esc(playerName(me))}.</p>
    <button class="small" data-act="forgetme">Not you?</button>
  </div>`;
}

function screenDinner(state, day, dayState) {
  const names = teamNames(state, day);
  const pending = E.pendingVersus(day, dayState);
  const totals = E.scoreBoth(day, dayState, state);
  const unjudged = pending.filter((p) => !p.verdict).length;
  const winner = totals.A.banked === totals.B.banked
    ? null : (totals.A.banked > totals.B.banked ? 'A' : 'B');

  return `
  <div class="masthead">
    <div class="kicker"><span>${esc(day.label)} · ${esc(day.date)}</span><span>Dinner</span></div>
    <h1>Dinner</h1>
    <div class="sub">${esc(content.text.dinnerIntro)}</div>
  </div>

  <div class="block">
    <div class="label">Versus — ${unjudged} to settle</div>
    ${pending.length ? pending.map((p) => `
      <div class="versus-row">
        <div class="heads">
          <strong style="font-family:var(--serif);font-size:20px">${esc(p.card.title)}</strong>
          <span class="price" style="font-size:26px">${coins(p.card.value)}</span>
        </div>
        ${typeBar(p.card)}
        <div class="claims">
          ${['A', 'divider', 'B'].map((s) => {
            if (s === 'divider') return '<div class="divider" style="background:var(--rule-hard)"></div>';
            const entry = dayState.teams[s].done.find((d) => d.cardId === p.cardId);
            const shots = state.photos.filter((ph) => ph.dayId === day.id && ph.cardId === p.cardId && ph.side === s);
            return `<div class="claim${p.verdict === s ? ' won' : ''}">
              <div class="who">${esc(names[s])}</div>
              ${entry
                ? `Completed ${esc(E.formatHM(entry.gameAt))}${entry.by ? ` by ${esc(playerName(entry.by))}` : ''}`
                : 'Did not reach it'}
              ${shots.length ? `<div class="shots" style="grid-template-columns:repeat(2,1fr)">${shots.map((ph) => `<img src="${esc(Net.photoUrl(ph.id))}" alt="">`).join('')}</div>` : ''}
            </div>`;
          }).join('')}
        </div>
        <div class="btn-row">
          <button class="small grow ${p.verdict === 'A' ? 'primary' : ''}" data-act="verdict" data-card="${esc(p.cardId)}" data-side="A">${esc(names.A)}</button>
          <button class="small grow ${p.verdict === 'B' ? 'primary' : ''}" data-act="verdict" data-card="${esc(p.cardId)}" data-side="B">${esc(names.B)}</button>
        </div>
        <p class="note" style="margin-top:8px">Winner takes ${coins(p.card.value)}. Loser takes ${coins(p.card.value * E.loserShare(p.card))}.</p>
      </div>`).join('')
      : '<p class="note">No VERSUS cards were reached.</p>'}
  </div>

  <div class="block">
    <div class="label">Position</div>
    ${E.SIDES.map((s) => {
      const team = dayState.teams[s];
      if (!team.position) return `<p class="note">${esc(names[s])} — none declared.</p>`;
      const outcome = E.positionOutcome(dayState, s, day);
      return `<p class="note"><strong>${esc(names[s])}</strong> — ${esc(content.cards[team.position.cardId].title)},
        declared ${esc(E.formatHM(team.position.gameAt))} at ×${team.position.triple ? content.rules.positionTriple : content.rules.positionDouble}.
        <span class="${outcome.state === 'failed' ? 'loss' : ''}">${esc(outcome.state === 'landed' ? 'Landed.' : outcome.state === 'failed' ? `Failed. ${outcome.reason}` : outcome.reason)}</span></p>`;
    }).join('')}
  </div>

  <div class="scores">
    ${['A', 'divider', 'B'].map((s) => {
      if (s === 'divider') return '<div class="divider"></div>';
      return `<div class="score${winner === s ? ' mine' : ''}">
        <div class="team-name">${esc(names[s])}</div>
        <span class="coin${totals[s].banked < 0 ? ' neg' : ''}" data-coin="${s}" data-value="${totals[s].banked}">${coins(totals[s].banked)}</span>
        <div class="meta">${totals[s].pending ? `${totals[s].pending} pending` : 'settled'}</div>
      </div>`;
    }).join('')}
  </div>

  <div class="block">
    ${unjudged
      ? `<p class="note">${unjudged} VERSUS card${unjudged === 1 ? '' : 's'} still to settle.</p>`
      : dayState.dinner.declared
        ? `<div class="notice solid"><span class="k">Declared</span>
             ${winner ? `${esc(names[winner])} take ${esc(day.label)}.` : 'A dead heat.'}</div>`
        : '<button class="big primary" data-act="declare">Declare the winner</button>'}
  </div>

  <div class="block">
    <div class="label">Superlatives</div>
    <p class="note">One per player, by acclaim. Free text.</p>
    <div class="prompt-chips">
      ${content.superlativePrompts.map((p) => `<button data-act="prompt" data-text="${esc(p)}">${esc(p)}</button>`).join('')}
    </div>
    <input type="text" id="superlative" placeholder="Award, and who to" autocomplete="off">
    <div style="margin-top:10px"><button class="grow" data-act="addsuper">Enter it</button></div>
    ${dayState.dinner.superlatives.map((s) => `
      <div class="superlative"><div class="who">${esc(playerName(s.player))}</div>${esc(s.text)}</div>`).join('')}
  </div>`;
}

// --- Render ----------------------------------------------------------------

function navMarkup() {
  return [['play', 'Play'], ['count', 'Counters'], ['ledger', 'Day sheet'], ['dinner', 'Dinner']]
    .map(([id, label]) =>
      `<button data-act="tab" data-id="${id}" ${tab === id ? 'aria-current="true"' : ''}>${label}</button>`)
    .join('');
}

function syncMarkup() {
  const s = Net.status;
  if (s.lastError && !s.connected) return '<div class="sync bad">Not connected — nothing is saving</div>';
  if (s.saving) return '<div class="sync">Saving…</div>';
  return '<div class="sync">In step with all phones</div>';
}

function render() {
  bannerEl.textContent = content.banner;
  const state = Net.getState();
  const day = currentDay();

  if (!me || (content.password != null && !unlocked)) {
    nav.classList.add('hide');
    app.innerHTML = screenGate();
    return;
  }

  nav.classList.remove('hide');
  nav.innerHTML = navMarkup();

  const dayState = state.days[day.id];
  const started = dayState && dayState.startedAt;
  const safeDay = dayState || E.ensureDay(structuredClone(state), day);

  let html = '';
  if (flash && Date.now() < flashUntil) {
    html += `<div class="notice red"><span class="k">Note</span>${esc(flash)}</div>`;
  }

  if (tab === 'play') html += started ? screenPlay(state, day, dayState) : screenStart(state, day);
  else if (tab === 'count') html += screenCounters(state, day, safeDay);
  else if (tab === 'ledger') html += screenLedger(state, day, safeDay);
  else html += screenDinner(state, day, safeDay);

  html += syncMarkup();
  app.innerHTML = html;
  lastSignature = signature(state);
}

// What the buttons depend on. When this changes the screen is rebuilt; between
// changes the tick only refreshes clocks and totals, so typing is never lost.
function signature(state) {
  const day = currentDay();
  const ds = state.days[day.id];
  const now = Date.now();
  if (!ds) return `${dayId}|${tab}|nostart|${state.setup.day1PairingId}|${me}|${!!flash}`;
  return [
    dayId, tab, ds.startedAt, !!flash,
    E.isAfterWhistle(day, ds, now), E.zonesOpen(day, ds, now),
    JSON.stringify(ds.dinner.verdicts), ds.dinner.superlatives.length, ds.dinner.declared,
    ds.findMyLog.length,
    JSON.stringify(Object.keys(ds.standing).map((k) => [k, ds.standing[k].length])),
    state.photos.length, JSON.stringify(state.flags),
    ...E.SIDES.map((s) => {
      const t = ds.teams[s];
      return [s, t.hand.join(','), t.done.length, t.vetoed.length, t.failed.length,
        t.curses.length, t.attemptLog.length, JSON.stringify(t.evidence),
        E.isFrozen(t, now), E.oneCardActive(t, now), t.halfPending, t.swept,
        t.position ? t.position.i : 'x'].join(':');
    }),
  ].join('|');
}

function tick() {
  const state = Net.getState();
  if (signature(state) !== lastSignature) { render(); return; }

  const day = currentDay();
  const ds = state.days[day.id];
  if (!ds || !ds.startedAt) return;

  const clock = document.querySelector('.clockbar');
  if (clock) clock.outerHTML = clockBar(day, ds);

  const totals = E.scoreBoth(day, ds, state);
  for (const side of E.SIDES) {
    const el = document.querySelector(`[data-coin="${side}"]`);
    if (el) tickNumber(el, totals[side].banked);
  }
  maybeReleaseFreeze(state, day, ds);
}

// Numbers tick up. Nothing bounces.
function tickNumber(el, target) {
  const from = Number(el.dataset.value || 0);
  if (from === target) { el.textContent = coins(target); return; }
  el.dataset.value = String(target);
  el.classList.toggle('neg', target < 0);
  const start = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - start) / 420);
    el.textContent = coins(Math.round(from + (target - from) * k));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// A veto or a curse blocks the draw. When it clears somebody has to ask for the
// card; whichever phone gets there first wins, the rest no-op.
function maybeReleaseFreeze(state, day, ds) {
  if (releasing || busy) return;
  const side = mySide(state, day);
  if (!side) return;
  const team = ds.teams[side];
  const now = Date.now();
  if (team.swept || E.isAfterWhistle(day, ds, now) || E.isFrozen(team, now)) return;
  const needs = team.freezeUntil != null
    || (team.hand.length < E.handTarget(team, now) && team.drawn < day.sequence.length);
  if (!needs) return;
  releasing = true;
  Net.mutate((draft) => E.releaseFreeze(draft, day, side, Date.now()))
    .finally(() => { releasing = false; });
}

// --- Events ----------------------------------------------------------------

document.addEventListener('change', async (ev) => {
  const input = ev.target.closest('[data-act="photo"]');
  if (!input || !input.files || !input.files[0]) return;
  const state = Net.getState();
  const day = currentDay();
  const side = mySide(state, day);
  const cardId = input.dataset.card;
  const file = input.files[0];
  const id0 = opId();
  input.value = '';
  await act(async () => {
    const id = await Net.uploadPhoto(file);
    return Net.mutate((draft) => {
      if (draft.photos.some((p) => p.op === id0)) return;
      draft.photos.push({ op: id0, id, dayId: day.id, cardId, side, by: me, at: Date.now() });
    });
  });
});

document.addEventListener('click', async (ev) => {
  const el = ev.target.closest('[data-act]');
  if (!el || el.tagName === 'INPUT') return;
  const action = el.dataset.act;
  const state = Net.getState();
  const day = currentDay();

  if (action === 'unlock') {
    const value = (document.getElementById('pw') || {}).value || '';
    if (value.trim().toLowerCase() === String(content.password).toLowerCase()) { unlocked = true; render(); }
    else say('That is not it.');
    return;
  }
  if (action === 'pickme') { me = el.dataset.id; localStorage.setItem(KEY_PLAYER, me); render(); return; }
  if (action === 'forgetme') { me = null; localStorage.removeItem(KEY_PLAYER); render(); return; }
  if (action === 'tab') { tab = el.dataset.id; flash = null; render(); return; }
  if (action === 'day') {
    dayId = Number(el.dataset.id); localStorage.setItem(KEY_DAY, String(dayId)); render(); return;
  }
  if (action === 'prompt') {
    const input = document.getElementById('superlative');
    if (input) { input.value = `${el.dataset.text} — `; input.focus(); }
    return;
  }

  const side = mySide(state, day);

  if (action === 'flip' || action === 'pairing') {
    // Roll once, here, so a write that has to be retried cannot re-roll it.
    const chosen = action === 'flip' ? E.flipDay1Pairing() : el.dataset.id;
    await act(() => Net.mutate((draft) => E.setDay1Pairing(draft, chosen)));
    return;
  }
  if (action === 'start') {
    await act(() => Net.mutate((draft) => { E.startDay(draft, day, Date.now()); }));
    return;
  }
  if (action === 'complete') {
    const i = Number(el.dataset.i);
    await act(() => Net.mutate((draft) => E.completeCard(draft, day, side, i, me, Date.now())));
    return;
  }
  if (action === 'veto') {
    const i = Number(el.dataset.i);
    if (!confirm(`Veto ${content.cards[day.sequence[i].id].title}?\n\n${content.text.vetoRule}`)) return;
    await act(() => Net.mutate((draft) => E.vetoCard(draft, day, side, i, me, Date.now())));
    return;
  }
  if (action === 'attempt') {
    const i = Number(el.dataset.i);
    const op = opId();
    await act(() => Net.mutate((draft) => E.logAttempt(draft, day, side, i, me, op, Date.now())));
    return;
  }
  if (action === 'evidence') {
    const on = el.dataset.on === '1';
    await act(() => Net.mutate((draft) =>
      E.setEvidence(draft, day, side, el.dataset.card, el.dataset.item, on)));
    return;
  }
  if (action === 'position') {
    const i = Number(el.dataset.i);
    const ds = state.days[day.id];
    const check = E.canDeclarePosition(ds, side, i);
    if (!check.ok) { say(check.why); return; }
    const card = content.cards[day.sequence[i].id];
    const triple = ds.teams[side].done.length < 2;
    const mult = triple ? content.rules.positionTriple : content.rules.positionDouble;
    if (!confirm(`Declare ${card.title} as your Position?\n\n×${mult} if you land it, ${content.rules.positionFailPenalty} if you do not.${E.isVersus(card) ? '\n\nIt is VERSUS — you must win it, not merely complete it.' : ''}\n\nThis locks for the day.`)) return;
    await act(() => Net.mutate((draft) => E.declarePosition(draft, day, side, i, me, Date.now())));
    return;
  }
  if (action === 'standing') {
    const op = opId();
    await act(() => Net.mutate((draft) =>
      E.logStanding(draft, day, el.dataset.mech, el.dataset.btn, me, op, Date.now())));
    return;
  }
  if (action === 'findmy') {
    const op = opId();
    await act(() => Net.mutate((draft) => E.logFindMy(draft, day, side, me, op, Date.now())));
    return;
  }
  if (action === 'verdict') {
    await act(() => Net.mutate((draft) => E.setVerdict(draft, day, el.dataset.card, el.dataset.side)));
    return;
  }
  if (action === 'declare') {
    await act(() => Net.mutate((draft) => { E.ensureDay(draft, day).dinner.declared = true; }));
    return;
  }
  if (action === 'addsuper') {
    const input = document.getElementById('superlative');
    const text = input && input.value.trim();
    if (!text) { say('Nothing to enter.'); return; }
    if (input) input.value = '';
    await act(() => Net.mutate((draft) => E.addSuperlative(draft, day, me, text)));
  }
});

// --- Boot ------------------------------------------------------------------

document.title = content.siteTitle;
Net.onChange(() => { if (signature(Net.getState()) !== lastSignature) render(); });
Net.startPolling();
render();
setInterval(tick, 1000);
