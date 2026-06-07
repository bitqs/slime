/** @typedef {import('./types').Snapshot} Snapshot */
/** @typedef {import('./types').UsageCache} UsageCache */
/** @typedef {import('./types').StatuslineStdin} StatuslineStdin */

const { bar } = require('./report');
const usage = require('./usage');

// Strip C0/C1 controls (incl. ESC → kills ANSI/OSC); preserve emoji/CJK;
// truncate by code point. Statusline runs on every keystroke — a planted
// escape sequence in any state file would replay into the terminal forever.
/** @param {unknown} s @param {number} [max] @returns {string} */
function sanitize(s, max = 60) {
  if (s == null) return '';
  const kept = [];
  for (const ch of String(s)) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp < 0x20 || cp === 0x7f || (cp >= 0x80 && cp <= 0x9f)) continue;
    kept.push(ch);
  }
  if (kept.length > max) return kept.slice(0, max).join('') + '…';
  return kept.join('');
}

/**
 * @param {Snapshot | null | undefined} snap
 * @param {StatuslineStdin | null | undefined} stdinJson
 * @param {string[]} tips
 * @param {number} now
 * @param {UsageCache | null | undefined} usageCache
 * @param {string} [lang]
 * @returns {string}
 */
function render(snap, stdinJson, tips, now, usageCache, lang) {
  const locale = require('./locale');
  const l = lang || locale.current();
  /** @param {string} key @param {Record<string, unknown>} [vars] @returns {string} */
  const T = (key, vars) => locale.fmt(locale.t(key, l), vars);
  const hpVal = usage.hp(usageCache);
  if (hpVal === 0) {
    const t = usage.restTime(usageCache);
    return t ? T('hud.restAt', { time: t }) : T('hud.restSoon');
  }
  if (!snap) return T('hud.idle');
  const idleMs = now - (snap.updated || 0);

  if (snap.inTurn && idleMs > 20000 && tips.length) {
    return sanitize(tips[Math.floor(now / 20000) % tips.length], 120);
  }

  if (!snap.inTurn) return sanitize(snap.lastText, 120) || T('hud.yourTurn');

  const parts = [];
  if (hpVal != null) parts.push(`⚡Token ${hpVal}%`);
  const todos = Array.isArray(snap.todos) ? snap.todos : [];
  const doneCnt = todos.filter((t) => t.status === 'completed').length;
  const cnt = todos.length ? ` ⚔${doneCnt}/${todos.length}` : '';
  if (snap.boss && snap.boss.broken) {
    parts.push(T('hud.broken', { name: sanitize(snap.boss.name) }) + cnt);
  } else if (snap.boss) {
    parts.push(`🗡️ ${sanitize(snap.boss.name)} ${bar(snap.boss.hp)} ${snap.boss.hp}%${cnt}`);
  }
  const next = todos.find((t) => t.status === 'in_progress') || todos.find((t) => t.status === 'pending');
  if (next) parts.push(T('hud.next', { step: sanitize(next.activeForm || next.content, 40) }));
  if (snap.combo > 1) parts.push(`🔥combo×${snap.combo}`);
  if (snap.summons > 0) parts.push(`🐺×${snap.summons}`);
  parts.push(`💀${snap.kills || 0} ⚔️${snap.dmg || 0}`);
  const cost = stdinJson && stdinJson.cost && stdinJson.cost.total_cost_usd;
  if (cost) parts.push(`💰$${cost.toFixed(2)}`);
  if (snap.lastText) parts.push(sanitize(snap.lastText, 120));
  return parts.join(' | ');
}

module.exports = { render, sanitize };
