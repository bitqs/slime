'use strict';

const fs = require('node:fs');
const path = require('node:path');
const state = require('./lib/state');
const locale = require('./lib/locale');

const SEVEN_DAYS = 7 * 24 * 3600 * 1000;

function weekly(now = Date.now()) {
  const cutoff = now - SEVEN_DAYS;
  const sessionsDir = path.join(state.ROOT, 'sessions');

  let dmg = 0, kills = 0, hits = 0, turns = 0, potions = 0, summons = 0, maxCombo = 0;
  const activeDaySet = new Set();

  /** @type {string[]} */
  let files = [];
  try { files = fs.readdirSync(sessionsDir).filter((f) => f.endsWith('.jsonl')); }
  catch { /* no sessions dir yet */ }

  for (const file of files) {
    const lines = (() => {
      try {
        return fs.readFileSync(path.join(sessionsDir, file), 'utf8')
          .split('\n').filter(Boolean);
      } catch { return []; }
    })();
    for (const line of lines) {
      let ev;
      try { ev = JSON.parse(line); } catch { continue; }
      if (!ev.t || ev.t < cutoff) continue;

      // active day
      const d = new Date(ev.t);
      activeDaySet.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);

      if (ev.kind === 'turn_end') { turns++; continue; }
      if (ev.kind === 'summon_back') { summons++; continue; }
      if (ev.kind === 'potion') { potions++; continue; }
      if (ev.kind === 'resolve') {
        if (ev.dmg) dmg += ev.dmg;
        if (ev.kill) kills++;
        if (ev.hit) hits++;
        if (ev.combo != null && ev.combo > maxCombo) maxCombo = ev.combo;
      }
    }
  }

  // pull milestone and gear data from profile
  const prof = state.readProfile();
  const milestones = (prof.milestones || []).filter((m) => {
    const ts = m.date ? new Date(m.date).getTime() : 0;
    return ts >= cutoff && ts <= now;
  });

  /** @type {Record<string, number>} */
  const gearUse = /** @type {Record<string, number>} */ (/** @type {unknown} */ (prof.gearUse || prof.gear || {}));
  const topGear = Object.entries(gearUse)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  return { dmg, kills, hits, turns, potions, summons, maxCombo, activeDays: activeDaySet.size, milestones, topGear };
}

/**
 * @param {ReturnType<typeof weekly>} data
 * @param {string} [lang]
 * @returns {string}
 */
function card(data, lang) {
  /** @param {string} key @returns {string} */
  const T = (key) => locale.t(key, lang);
  const WIDTH = 36;
  const inner = WIDTH - 2; // between the │ chars

  /** @param {string} left @param {string} right @returns {string} */
  function row(left, right) {
    const line = `  ${left}: ${right}`;
    const pad = inner - line.length;
    return `║${line}${' '.repeat(Math.max(0, pad))}║`;
  }

  /** @param {string} text @returns {string} */
  function centre(text) {
    const visible = text.replace(/[̀-ͯ]/g, '').length; // rough
    // emoji width: treat each emoji as 2 chars for centering
    const pad = Math.max(0, inner - visible);
    const left = Math.floor(pad / 2);
    const right = pad - left;
    return `║${' '.repeat(left)}${text}${' '.repeat(right)}║`;
  }

  const top = `╔${'═'.repeat(inner)}╗`;
  const bot = `╚${'═'.repeat(inner)}╝`;
  const sep = `╠${'═'.repeat(inner)}╣`;
  const blank = `║${' '.repeat(inner)}║`;

  const lines = [
    top,
    centre(T('wrapped.title')),
    sep,
    blank,
    row(T('wrapped.dmg'), String(data.dmg)),
    row(T('wrapped.kills'), String(data.kills)),
    row(T('wrapped.turns'), String(data.turns)),
    row(T('wrapped.days'), String(data.activeDays)),
  ];

  if (data.topGear && data.topGear.length > 0) {
    lines.push(blank);
    lines.push(row(T('wrapped.gear'), data.topGear.map((/** @type {[string, number]} */ [k, v]) => `${k}×${v}`).join(' ')));
  }

  if (data.milestones && data.milestones.length > 0) {
    lines.push(blank);
    lines.push(row(T('wrapped.bosses'), String(data.milestones.length)));
  }

  lines.push(blank);
  lines.push(bot);

  return lines.join('\n');
}

if (require.main === module) {
  console.log(card(weekly(), locale.current()));
}

module.exports = { weekly, card };
