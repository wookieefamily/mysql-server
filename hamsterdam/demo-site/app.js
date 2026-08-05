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

function say(msg) {
  flash = msg;
  flashUntil = Date.now() + 4000;
  render();
}

function currentDay() {
  return E.dayDef(dayId);
}

function mySide(state, day) {
  const pairing = E.pairingForDay(state, day);
  if (!pairing || !me) return null;
  if (pairing.A.members.includes(me)) return 'A';
  if (pairing.B.members.includes(me)) return 'B';
  return null;
}

function teamNames(state, day) {
  const pairing = E.pairingForDay(state, day);
  return pairing
    ? { A: pairing.A.name, B: pairing.B.name }
    : { A: 'Team A', B: 'Team B' };
}

function playerName(id) {
  const p = content.players.find((x) => x.id === id);
  return p ? p.name : id;
}

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

// --- Card rendering --------------------------------------------------------

function tagsFor(card) {
  const type = E.cardTypeOf(card);
  const cls = { VERSUS: 'versus', SOLO: 'solo', AUTO_VETO: 'autoveto' }[card.type] || '';
  const out = [`<span class="tag ${cls}">${esc(type.label)}</span>`];
  if (card.type === 'AUTO_VETO' && card.attempts) {
    out.push(`<span class="tag autoveto">${card.attempts} attempts</span>`);
  }
  for (const tagId of card.tags || []) {
    const tag = content.cardTags[tagId];
    if (tag) out.push(`<span class="tag ${tagId === 'timeSink' ? 'timesink' : 'build'}">${esc(tag.label)}</span>`);
  }
  return out.join('');
}

function cardMarkup(state, day, dayState, side, absIndex, opts = {}) {
  const entry = day.sequence[absIndex];
  const card = content.cards[entry.id];
  const team = dayState.teams[side];
  const now = Date.now();
  const frozen = E.isFrozen(team, now);
  const ended = E.isAfterWhistle(day, dayState, now);
  const isPosition = team.position && team.position.i === absIndex;
  const shots = state.photos.filter(
    (p) => p.dayId === day.id && p.cardId === entry.id && p.side === side);

  const positionTag = isPosition
    ? `<span class="tag position">POSITION ×${team.position.triple ? content.rules.positionTriple : content.rules.positionDouble}</span>`
    : '';

  const canDeclare = !team.position && !ended && !opts.suspended;
  const disabled = frozen || ended || opts.suspended;

  return `
  <article class="card${opts.suspended ? ' suspended' : ''}">
    <div class="card-head">
      <h2 class="card-title">${esc(card.title)}</h2>
      <div class="card-value">${coins(card.value)}</div>
    </div>
    <div class="tags">${tagsFor(card)}${positionTag}</div>
    <p class="card-body">${esc(card.body)}</p>
    ${opts.suspended ? '<p class="note"><strong>Suspended.</strong> You are holding one card only until the curse lifts.</p>' : ''}
    ${shots.length ? `<div class="shots">${shots.map((p) => `<img src="${esc(Net.photoUrl(p.id))}" alt="">`).join('')}</div>` : ''}
    <div class="card-foot">
      <button class="primary grow" data-act="complete" data-i="${absIndex}" ${disabled ? 'disabled' : ''}>Complete</button>
      <button data-act="veto" data-i="${absIndex}" ${disabled ? 'disabled' : ''}>Veto</button>
      <label class="btn file small">Photo
        <input type="file" accept="image/*" capture="environment"
               data-act="photo" data-card="${esc(entry.id)}" ${ended ? 'disabled' : ''}>
      </label>
      ${canDeclare ? `<button class="small green" data-act="position" data-i="${absIndex}">Position</button>` : ''}
    </div>
  </article>`;
}

function curseMarkup(rec) {
  const curse = content.curses[rec.curseId];
  return `
  <article class="card curse">
    <div class="card-head">
      <h2 class="card-title">${esc(curse.title)}</h2>
      <div class="card-value">${coins(curse.value)}</div>
    </div>
    <div class="tags">
      <span class="tag curse-tag">CURSE</span>
      ${rec.converted ? `<span class="tag curse-tag">LATE — ${coins(content.rules.lateCurseFlatPenalty)}</span>` : ''}
    </div>
    <p class="card-body">${esc(curse.body)}</p>
    ${rec.converted
      ? `<p class="note" style="color:#d9d0be">Drawn after ${esc(E.formatHM(E.parseHM(E.dayDef(dayId).convertAt)))}. It keeps its coins; the time penalty became a flat ${coins(content.rules.lateCurseFlatPenalty)}.</p>`
      : ''}
  </article>`;
}

// --- Screens ---------------------------------------------------------------

function screenGate() {
  if (content.password != null && !unlocked) {
    return `
    <div class="masthead"><h1>Hamsterdam</h1><div class="sub">${esc(content.build)}</div></div>
    <div class="block">
      <div class="label">Password</div>
      <input type="text" id="pw" autocomplete="off" autocapitalize="none" spellcheck="false">
      <div style="margin-top:12px"><button class="big primary" data-act="unlock">Enter</button></div>
    </div>`;
  }
  return `
  <div class="masthead">
    <h1>Hamsterdam</h1>
    <div class="sub">${esc(content.build)} — pick your player</div>
  </div>
  <div class="block">
    <div class="label">Which one are you</div>
    <div class="picker">
      ${content.players.map((p) => `
        <button class="pick" data-act="pickme" data-id="${esc(p.id)}" aria-pressed="${me === p.id}">
          <span>${esc(p.name)}</span><span class="tick">${me === p.id ? 'You' : 'Choose'}</span>
        </button>`).join('')}
    </div>
    <p class="note" style="margin-top:14px">Stays on this phone. Change it any time from the ledger.</p>
  </div>`;
}

function daySwitcher(state) {
  return `
  <div class="btn-row" style="margin-bottom:14px">
    ${content.days.map((d) => {
      const started = state.days[d.id] && state.days[d.id].startedAt;
      const current = d.id === dayId;
      return `<button class="small grow${current ? ' primary' : ''}" data-act="day" data-id="${d.id}"${current ? ' aria-current="true"' : ''}>Day ${esc(d.id)}${started ? ' ·' : ''}</button>`;
    }).join('')}
  </div>`;
}

function screenStart(state, day) {
  const pairing = E.pairingForDay(state, day);
  const chosen = state.setup.day1PairingId;
  const names = teamNames(state, day);
  const needPairing = !pairing;

  return `
  <div class="masthead">
    <h1>${esc(day.label)}</h1>
    <div class="sub">${esc(day.date)} — ${esc(day.demoPlace || day.place)}</div>
  </div>
  ${daySwitcher(state)}

  <div class="notice solid">
    <span class="k">Hard rule</span>${esc(content.text.noRunning)}
  </div>

  <div class="block">
    <div class="label">Teams</div>
    ${day.pairing === 'fixed'
      ? `<p class="note">${esc(content.fixedPairing.label)}. Fixed, not chosen.</p>
         <table class="ledger"><tr><td>${esc(content.fixedPairing.A.name)}</td><td class="n">A</td></tr>
         <tr><td>${esc(content.fixedPairing.B.name)}</td><td class="n">B</td></tr></table>`
      : `<p class="note">Set Day One's pairing. Day Two automatically takes the other, so the same pairing cannot be used twice and none is left unused.</p>
         <div class="picker" style="margin-top:10px">
           ${content.choosablePairings.map((p) => `
             <button class="pick" data-act="pairing" data-id="${esc(p.id)}" aria-pressed="${chosen === p.id}">
               <span>${esc(p.A.name)}<br><span class="tiny">against ${esc(p.B.name)}</span></span>
               <span class="tick">${chosen === p.id ? 'Day 1' : 'Pick'}</span>
             </button>`).join('')}
         </div>
         ${chosen ? `<div class="rule-text" style="margin-top:12px">
            ${content.days.filter((d) => d.pairing !== 'fixed').map((d) => {
              const p = E.pairingForDay(state, d);
              return `${esc(d.label)}: ${esc(p.A.name)} against ${esc(p.B.name)}.`;
            }).join('<br>')}
          </div>` : ''}`}
  </div>

  ${pairing ? `
  <div class="block">
    <div class="label">Today</div>
    <table class="ledger">
      <tr><td>${esc(names.A)}</td><td class="n">${mySide(state, day) === 'A' ? 'You' : ''}</td></tr>
      <tr><td>${esc(names.B)}</td><td class="n">${mySide(state, day) === 'B' ? 'You' : ''}</td></tr>
      <tr><td class="sub">Whistle</td><td class="n">${esc(day.whistle)}</td></tr>
      <tr><td class="sub">Deck</td><td class="n">${E.liveCardIds(day, state.flags).length} cards</td></tr>
    </table>
  </div>` : ''}

  <div class="block">
    <div class="label">The clock</div>
    <p class="note">Cards deal the moment you press start and the clock runs from that moment to the whistle at ${esc(day.whistle)}.
    ${content.clock.speedFactor !== 1 ? `<strong>${esc(content.clock.note)}</strong> A full day plays through in about ${Math.round((E.parseHM(day.whistle) - E.parseHM(content.clock.fixedStart)) / content.clock.speedFactor)} minutes.` : ''}</p>
  </div>

  <hr class="hard-rule">
  <button class="big primary" data-act="start" ${needPairing || busy ? 'disabled' : ''}>Start ${esc(day.label)}</button>
  ${needPairing ? '<p class="note center" style="margin-top:10px">Set the pairing first.</p>' : ''}`;
}

function scoreBoard(state, day, dayState) {
  const names = teamNames(state, day);
  const totals = E.scoreBoth(day, dayState, state);
  const side = mySide(state, day);
  return `
  <div class="scores">
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
  return `
  <div class="clockbar">
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
      You are not on a team for ${esc(day.label)}. Set the pairing on the start screen.</div>`;
  }
  const team = dayState.teams[side];
  const ended = E.isAfterWhistle(day, dayState, now);
  const frozen = E.isFrozen(team, now);
  const progress = E.deckProgress(day, dayState, side, state.flags);
  const effects = E.displayEffects(team, now);
  const zonesShut = day.zones && !E.zonesOpen(day, dayState, now);
  const recentCurse = team.curses.length
    ? team.curses[team.curses.length - 1] : null;
  const showCurse = recentCurse && (now - recentCurse.at) < E.realMsForGameMinutes(45);

  let body = '';

  if (ended) {
    body += `<div class="notice solid"><span class="k">The whistle</span>${esc(content.text.whistleRule)}</div>
      <button class="big primary" data-act="tab" data-id="dinner">Go to dinner</button>`;
  } else if (team.swept) {
    body += `<div class="notice solid"><span class="k">Clean sweep</span>
      Deck cleared. Play has stopped for you, the score is banked and you take ${coins(content.rules.cleanSweepBonus)}.</div>`;
  } else {
    if (zonesShut) {
      body += `<div class="notice green"><span class="k">Opening zone — lifts ${esc(E.formatHM(E.zonesLiftAt(dayState)))}</span>
        ${esc(day.zones[side])}. ${esc(day.zones.lifts)}</div>`;
    }
    if (frozen) {
      body += `<div class="notice red"><span class="k">Frozen</span>
        ${E.formatDuration(E.freezeRemainingGameMinutes(team, now))} remaining. The next draw is blocked until it clears.</div>`;
    }
    if (E.oneCardActive(team, now)) {
      body += `<div class="notice red"><span class="k">One card only</span>
        ${E.formatDuration(E.gameMinutesForRealMs(team.oneCardUntil - now))} remaining.</div>`;
    }
    if (team.halfPending) {
      body += `<div class="notice red"><span class="k">Half</span>Your next completed card is worth half.</div>`;
    }
    for (const eff of effects) {
      body += `<div class="notice red"><span class="k">${esc(eff.title)}</span>
        ${E.formatDuration(eff.remaining)} remaining.</div>`;
    }
    if (showCurse) body += curseMarkup(recentCurse);

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
  ${daySwitcher(state)}
  ${scoreBoard(state, day, dayState)}
  ${clockBar(day, dayState)}
  <div class="spread" style="margin-bottom:12px">
    <span class="tiny">Deck ${progress.done} of ${progress.total}</span>
    <span class="tiny">${team.position ? `Position declared ×${team.position.triple ? content.rules.positionTriple : content.rules.positionDouble}` : 'Position open'}</span>
  </div>
  ${body}`;
}

function screenCounters(state, day, dayState) {
  const side = mySide(state, day);
  const names = teamNames(state, day);
  // These fire opportunistically. They must never require the day to be open,
  // a particular screen, or a particular card.
  const teamsKnown = !!E.pairingForDay(state, day);

  const findMy = day.findMy && day.findMy.enabled ? `
    <div class="block">
      <div class="label">Find My</div>
      <p class="note">${day.findMy.cost > 0
        ? `Legal, declared at dinner, ${coins(day.findMy.cost)} a look.`
        : 'Free and unlimited today. Nothing to log.'}</p>
      ${day.findMy.cost > 0 ? `
        <div class="spread" style="margin:10px 0">
          <span>${esc(names.A)}</span><span class="counter-count">${dayState.findMy.A || 0}</span>
        </div>
        <div class="spread" style="margin-bottom:10px">
          <span>${esc(names.B)}</span><span class="counter-count">${dayState.findMy.B || 0}</span>
        </div>
        <button class="grow" data-act="findmy" ${!side ? 'disabled' : ''}>Log a look — ${coins(-day.findMy.cost)}</button>` : ''}
    </div>` : '';

  return `
  <div class="masthead"><h1>Counters</h1><div class="sub">${esc(day.label)} — tap from anywhere</div></div>
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
  ${!teamsKnown ? '<p class="note center" style="margin-top:14px">Set the pairing on the start screen so these know which team to credit.</p>' : ''}`;
}

function screenLedger(state, day, dayState) {
  const names = teamNames(state, day);
  const totals = E.scoreBoth(day, dayState, state);
  return `
  <div class="masthead"><h1>Ledger</h1><div class="sub">${esc(day.label)} — ${esc(day.date)}</div></div>
  ${daySwitcher(state)}
  ${dayState.startedAt ? scoreBoard(state, day, dayState) : '<p class="note">Not started.</p>'}
  ${E.SIDES.map((s) => `
    <div class="block">
      <div class="label">${esc(names[s])}</div>
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
  <div class="masthead"><h1>Dinner</h1><div class="sub">${esc(day.label)} — declare the winner</div></div>
  <div class="block"><p class="note">${esc(content.text.dinnerIntro)}</p></div>

  <div class="block">
    <div class="label">Versus — ${unjudged} to settle</div>
    ${pending.length ? pending.map((p) => `
      <div class="versus-row">
        <div class="heads">
          <strong>${esc(p.card.title)}</strong>
          <span class="card-value" style="font-size:22px">${coins(p.card.value)}</span>
        </div>
        <div class="tags" style="margin-top:8px">${tagsFor(p.card)}</div>
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
        : `<button class="big primary" data-act="declare">Declare the winner</button>`}
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
  const tabs = [
    ['play', 'Play'], ['count', 'Counters'], ['ledger', 'Ledger'], ['dinner', 'Dinner'],
  ];
  return tabs.map(([id, label]) =>
    `<button data-act="tab" data-id="${id}" ${tab === id ? 'aria-current="true"' : ''}>${label}</button>`).join('');
}

function syncMarkup() {
  const s = Net.status;
  if (s.lastError && !s.connected) {
    return `<div class="sync bad">Not connected — nothing is saving</div>`;
  }
  if (s.saving) return `<div class="sync">Saving…</div>`;
  return `<div class="sync">In step with all phones</div>`;
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

  let html = '';
  if (flash && Date.now() < flashUntil) {
    html += `<div class="notice red"><span class="k">Note</span>${esc(flash)}</div>`;
  }

  if (tab === 'play') {
    html += started ? screenPlay(state, day, dayState) : screenStart(state, day);
  } else if (tab === 'count') {
    html += screenCounters(state, day, dayState || E.ensureDay(structuredClone(state), day));
  } else if (tab === 'ledger') {
    html += screenLedger(state, day, dayState || E.ensureDay(structuredClone(state), day));
  } else {
    html += screenDinner(state, day, dayState || E.ensureDay(structuredClone(state), day));
  }

  html += syncMarkup();
  app.innerHTML = html;
  lastSignature = signature(state);
}

// What the buttons depend on. When this changes, the screen must be rebuilt;
// otherwise the tick only refreshes clocks and totals, so typing is never
// interrupted.
function signature(state) {
  const day = currentDay();
  const ds = state.days[day.id];
  const now = Date.now();
  if (!ds) return `${dayId}|${tab}|nostart|${state.setup.day1PairingId}|${me}`;
  return [
    dayId, tab, ds.startedAt, !!flash,
    E.isAfterWhistle(day, ds, now),
    E.zonesOpen(day, ds, now),
    JSON.stringify(ds.dinner.verdicts),
    ds.dinner.superlatives.length,
    ds.dinner.declared,
    JSON.stringify(ds.findMy),
    JSON.stringify(Object.keys(ds.standing).map((k) => [k, ds.standing[k].length])),
    state.photos.length,
    JSON.stringify(state.flags),
    ...E.SIDES.map((s) => {
      const t = ds.teams[s];
      return [s, t.hand.join(','), t.done.length, t.vetoed.length, t.curses.length,
        E.isFrozen(t, now), E.oneCardActive(t, now), t.halfPending, t.swept,
        t.position ? t.position.i : 'x'].join(':');
    }),
  ].join('|');
}

function tick() {
  const state = Net.getState();
  const sig = signature(state);
  if (sig !== lastSignature) {
    render();
    return;
  }
  // Cheap refresh: clocks and totals only.
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
    const v = Math.round(from + (target - from) * k);
    el.textContent = coins(v);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// A veto or a curse blocks the draw. When it clears, somebody has to ask for
// the card. Whichever phone gets there first wins the race; the rest no-op.
function maybeReleaseFreeze(state, day, ds) {
  if (releasing || busy) return;
  const side = mySide(state, day);
  if (!side) return;
  const team = ds.teams[side];
  const now = Date.now();
  if (team.swept || E.isAfterWhistle(day, ds, now)) return;
  if (E.isFrozen(team, now)) return;
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
  input.value = '';
  await act(async () => {
    const id = await Net.uploadPhoto(file);
    return Net.mutate((draft) => {
      draft.photos.push({ id, dayId: day.id, cardId, side, by: me, at: Date.now() });
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
    if (value.trim().toLowerCase() === String(content.password).toLowerCase()) {
      unlocked = true; render();
    } else say('That is not it.');
    return;
  }
  if (action === 'pickme') {
    me = el.dataset.id;
    localStorage.setItem(KEY_PLAYER, me);
    render();
    return;
  }
  if (action === 'forgetme') {
    me = null; localStorage.removeItem(KEY_PLAYER); render(); return;
  }
  if (action === 'tab') { tab = el.dataset.id; flash = null; render(); return; }
  if (action === 'day') {
    dayId = Number(el.dataset.id);
    localStorage.setItem(KEY_DAY, String(dayId));
    render();
    return;
  }
  if (action === 'prompt') {
    const input = document.getElementById('superlative');
    if (input) { input.value = el.dataset.text + ' — '; input.focus(); }
    return;
  }

  const side = mySide(state, day);

  if (action === 'pairing') {
    const id = el.dataset.id;
    await act(() => Net.mutate((draft) => {
      const day1 = content.days.find((d) => d.pairing === 'choice');
      const started = draft.days[day1.id] && draft.days[day1.id].startedAt;
      if (started) return { ok: false, why: 'Day One has already started. The pairing is set.' };
      draft.setup.day1PairingId = id;
    }));
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
    const card = content.cards[day.sequence[i].id];
    if (!confirm(`Veto ${card.title}?\n\n${content.text.vetoRule}`)) return;
    await act(() => Net.mutate((draft) => E.vetoCard(draft, day, side, i, me, Date.now())));
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
    await act(() => Net.mutate((draft) =>
      E.logStanding(draft, day, el.dataset.mech, el.dataset.btn, me, Date.now())));
    return;
  }
  if (action === 'findmy') {
    await act(() => Net.mutate((draft) => { E.logFindMy(draft, day, side, Date.now()); }));
    return;
  }
  if (action === 'verdict') {
    await act(() => Net.mutate((draft) =>
      E.setVerdict(draft, day, el.dataset.card, el.dataset.side)));
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
    return;
  }
});

// --- Boot ------------------------------------------------------------------

document.title = content.siteTitle;
Net.onChange(() => {
  const sig = signature(Net.getState());
  if (sig !== lastSignature) render();
});
Net.startPolling();
render();
setInterval(tick, 1000);
