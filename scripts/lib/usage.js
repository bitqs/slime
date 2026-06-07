const fs = require('node:fs');
const path = require('node:path');
const state = require('./state');

const cachePath = (root) => path.join(root || state.ROOT, 'usage.json');

function readCache(root) {
  try { return JSON.parse(fs.readFileSync(cachePath(root), 'utf8')); }
  catch { return { fiveHour: null, sevenDay: null, contextPct: null, source: null, t: 0 }; }
}

function cacheFromStatusline(stdin, root) {
  if (!stdin) return;
  const prev = readCache(root);
  const rl = stdin.rate_limits || {};
  const next = {
    fiveHour: rl.five_hour
      ? { used: rl.five_hour.used_percentage, resetsAt: rl.five_hour.resets_at }
      : prev.fiveHour,
    sevenDay: rl.seven_day
      ? { used: rl.seven_day.used_percentage, resetsAt: rl.seven_day.resets_at }
      : prev.sevenDay,
    contextPct: stdin.context_window && stdin.context_window.used_percentage != null
      ? stdin.context_window.used_percentage
      : prev.contextPct,
    source: rl.five_hour ? 'official' : prev.source,
    t: Date.now(),
  };
  state.ensureDirs();
  fs.writeFileSync(cachePath(root), JSON.stringify(next));
}

function hp(cache) {
  if (!cache || !cache.fiveHour || cache.fiveHour.used == null) return null;
  return Math.max(0, Math.round(100 - cache.fiveHour.used));
}

function restTime(cache) {
  if (!cache || !cache.fiveHour || !cache.fiveHour.resetsAt) return null;
  const d = new Date(cache.fiveHour.resetsAt * 1000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

module.exports = { readCache, cacheFromStatusline, hp, restTime, cachePath };
