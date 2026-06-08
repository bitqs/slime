/** @typedef {import('./types').Snapshot} Snapshot */
/** @typedef {import('./types').UsageCache} UsageCache */
/** @typedef {import('./types').StatuslineStdin} StatuslineStdin */

const { bar } = require('./report');
const usage = require('./usage');

// OSC 8 hyperlink: terminals that support it make [HUD] clickable → local arena.
// Always shown so the arena is one click away; the port is the live arena's when
// one is running, else the default arena port. Built from a numeric port +
// constants only — never from state files (sanitize strips ESC).
/** @param {{ port: number } | null | undefined} live @returns {string} */
function uiLink(live) {
  const port = (live && Number.isInteger(live.port)) ? live.port : (Number(process.env.SLIME_PORT) || 4117);
  return `]8;;http://127.0.0.1:${port}[HUD]]8;;`;
}

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
 * @param {{ port: number } | null} [live] live arena info → renders clickable [HUD] link
 * @param {number} [level] player level → shown as a ✦Lv badge
 * @returns {string}
 */
function render(snap, stdinJson, tips, now, usageCache, lang, live, level) {
  const locale = require('./locale');
  const l = lang || locale.current();
  /** @param {string} key @param {Record<string, unknown>} [vars] @returns {string} */
  const T = (key, vars) => locale.fmt(locale.t(key, l), vars);
  const lv = level ? ` ✦Lv${level}` : '';
  const hpVal = usage.hp(usageCache);
  const wtkVal = usage.week(usageCache);
  // DTK (daily, 5h window) + WTK (weekly, 7-day window) meters, labelled.
  const meters = [hpVal != null ? `⚡ DTK${hpVal}%` : '', wtkVal != null ? `🏕 WTK${wtkVal}%` : ''].filter(Boolean).join('  ');
  const mSuffix = meters ? ' ' + meters : '';
  if (hpVal === 0) {
    const t = usage.restTime(usageCache);
    return t ? T('hud.restAt', { time: t }) : T('hud.restSoon');
  }
  if (!snap) return T('hud.idle');
  const idleMs = now - (snap.updated || 0);

  if (snap.inTurn && idleMs > 20000 && tips.length) {
    return sanitize(tips[Math.floor(now / 20000) % tips.length], 120);
  }

  // Between turns: still lead with the badge + live arena link, then the result.
  if (!snap.inTurn) {
    const body = sanitize(snap.lastText, 120) || T('hud.yourTurn');
    return `🟢${uiLink(live)}${lv}${mSuffix} ${body}`;
  }

  const parts = [];
  // plugin badge + arena link lead the line, then DTK/WTK meters; boss is a slime icon + hp
  parts.push(`🟢${uiLink(live)}${lv}${mSuffix}`);
  const todos = Array.isArray(snap.todos) ? snap.todos : [];
  const doneCnt = todos.filter((t) => t.status === 'completed').length;
  const cnt = todos.length ? ` ⚔${doneCnt}/${todos.length}` : '';
  if (snap.boss && snap.boss.broken) {
    parts.push(T('hud.broken') + cnt);
  } else if (snap.boss) {
    parts.push(`👾 ${bar(snap.boss.hp)} ${snap.boss.hp}%${cnt}`);
  }
  const next = todos.find((t) => t.status === 'in_progress') || todos.find((t) => t.status === 'pending');
  if (next) parts.push(T('hud.next', { step: sanitize(next.activeForm || next.content, 40) }));
  if (snap.combo > 1) parts.push(`🔥×${snap.combo}`);
  if (snap.summons > 0) parts.push(`🐺×${snap.summons}`);
  parts.push(`💀${snap.kills || 0} ⚔️${snap.dmg || 0}`);
  const cost = stdinJson && stdinJson.cost && stdinJson.cost.total_cost_usd;
  if (cost) parts.push(`💰$${cost.toFixed(2)}`);
  if (snap.lastText) parts.push(sanitize(snap.lastText, 120));
  return parts.join(' | ');
}

module.exports = { render, sanitize };
