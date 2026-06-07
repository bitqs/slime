'use strict';
/**
 * watch.js — top-of-terminal live battle monitor
 * Run in a small tmux pane: tmux split-window -bv -l 6 'node path/to/watch.js'
 * Pure observer — never writes any file.
 */

const fs = require('node:fs');
const path = require('node:path');
const { ROOT, readSnapshot, readEvents } = require('./lib/state');
const { readCache, hp, restTime } = require('./lib/usage');
const { bar } = require('./lib/report');
const locale = require('./lib/locale');

// ── helpers ──────────────────────────────────────────────────────────────────

function newestSessionId(root) {
  const dir = path.join(root, 'sessions');
  let best = null, bestMtime = 0;
  try {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      try {
        const st = fs.statSync(path.join(dir, f));
        if (st.mtimeMs > bestMtime) { bestMtime = st.mtimeMs; best = f.slice(0, -5); }
      } catch { /* skip */ }
    }
  } catch { /* dir missing */ }
  return best;
}

// ── pure render ───────────────────────────────────────────────────────────────

/**
 * renderFrame(snap, usageCache, events, lang, cols) → string
 *
 * snap        – session snapshot object or null
 * usageCache  – usage cache object or null
 * events      – array of event objects (with .text)
 * lang        – locale string ('en'|'zh')
 * cols        – terminal width
 */
function renderFrame(snap, usageCache, events, lang, cols) {
  const l = lang || locale.current();
  const T = (key, vars) => locale.fmt(locale.t(key, l), vars);
  const width = cols || 60;

  // ── rest banner when HP is 0 ──────────────────────────────────────────────
  const hpVal = hp(usageCache);
  if (hpVal === 0) {
    const t = restTime(usageCache);
    const restLine = t ? T('hud.restAt', { time: t }) : T('hud.restSoon');
    return restLine;
  }

  // ── no session yet ────────────────────────────────────────────────────────
  if (!snap) {
    return '⚔️ QUESTLINE — waiting for a session…';
  }

  const lines = [];

  // ── line 1: boss bar + player HP ─────────────────────────────────────────
  const bossName = snap.boss ? snap.boss.name : '???';
  const bossHp   = snap.boss ? snap.boss.hp   : 100;
  const bossBar  = bar(bossHp);
  const bossHpPct = `${bossHp}%`;
  const leftSide = `⚔️ QUESTLINE ── ${bossName} ${bossBar} ${bossHpPct} HP`;

  const rightParts = [];
  if (hpVal != null) rightParts.push(`⚡HP ${hpVal}%`);
  if (usageCache && usageCache.sevenDay && usageCache.sevenDay.used != null) {
    const weeklyHp = Math.max(0, Math.round(100 - usageCache.sevenDay.used));
    rightParts.push(`周 ${weeklyHp}%`);
  }
  const rightSide = rightParts.join(' │ ');

  if (rightSide) {
    const gap = width - leftSide.replace(/\x1b\[[0-9;]*m/g, '').length
                      - rightSide.replace(/\x1b\[[0-9;]*m/g, '').length;
    lines.push(leftSide + (gap > 0 ? ' '.repeat(gap) : '  ') + rightSide);
  } else {
    lines.push(leftSide);
  }

  // ── line 2: combo / summons / kills / dmg / turn ──────────────────────────
  const statParts = [];
  if ((snap.combo || 0) > 0)   statParts.push(`🔥 combo×${snap.combo}`);
  if ((snap.summons || 0) > 0) statParts.push(`🐺×${snap.summons}`);
  statParts.push(`💀${snap.kills || 0}`);
  statParts.push(`⚔️${snap.dmg || 0} dmg`);
  if (snap.turn != null) statParts.push(`Turn ${snap.turn}`);
  lines.push(statParts.join('   '));

  // ── line 3: separator ─────────────────────────────────────────────────────
  lines.push('─'.repeat(width));

  // ── lines 4-6: last 3 events with non-empty text ─────────────────────────
  const textEvents = events.filter((e) => e.text && e.text.trim()).slice(-3);
  for (const ev of textEvents) {
    lines.push(ev.text.trim());
  }

  return lines.map((line) => line.length > width ? line.slice(0, width - 1) + '…' : line).join('\n');
}

// ── live loop (only when run directly) ────────────────────────────────────────

function tick(lastGood) {
  try {
    const lang = locale.current();
    const cols = process.stdout.columns || 60;
    const sessionId = newestSessionId(ROOT);
    const snap    = sessionId ? readSnapshot(sessionId) : null;
    const cache   = readCache(ROOT);
    const events  = sessionId ? readEvents(sessionId) : [];
    const frame   = renderFrame(snap, cache, events, lang, cols);
    process.stdout.write('\x1b[2J\x1b[H' + frame + '\n');
    return frame;
  } catch {
    // keep last good frame on any error
    if (lastGood != null) {
      process.stdout.write('\x1b[2J\x1b[H' + lastGood + '\n');
    }
    return lastGood;
  }
}

if (require.main === module) {
  // hide cursor
  process.stdout.write('\x1b[?25l');

  function cleanup() {
    clearInterval(timer);
    process.stdout.write('\x1b[2J\x1b[H\x1b[?25h');
    process.exit(0);
  }
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  let lastGood = null;
  lastGood = tick(lastGood);
  const timer = setInterval(() => { lastGood = tick(lastGood); }, 1000);
}

module.exports = { renderFrame };
