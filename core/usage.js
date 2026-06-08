/** @typedef {import('./types').UsageCache} UsageCache */
/** @typedef {import('./types').StatuslineStdin} StatuslineStdin */
const path = require('node:path');
const state = require('./state');
const { safeWrite, readJson } = require('./safe-io');

/** @param {string} [root] @returns {string} */
const cachePath = (root) => path.join(root || state.ROOT, 'usage.json');

/** @param {string} [root] @returns {UsageCache} */
function readCache(root) {
  // `||`: a file containing literal `null` parses successfully — fallback won't fire
  return readJson(cachePath(root), null)
    || { fiveHour: null, sevenDay: null, contextPct: null, source: null, t: 0 };
}

/** @param {StatuslineStdin | null | undefined} stdin @param {string} [root] @returns {void} */
function cacheFromStatusline(stdin, root) {
  if (!stdin) return;
  const prev = readCache(root);
  const rl = stdin.rate_limits || {};
  const cost = stdin.cost || {};
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
    cost: cost.total_cost_usd != null ? cost.total_cost_usd : prev.cost ?? null,
    model: stdin.model && stdin.model.display_name ? stdin.model.display_name : prev.model ?? null,
    lines: cost.total_lines_added != null || cost.total_lines_removed != null
      ? { added: cost.total_lines_added || 0, removed: cost.total_lines_removed || 0 }
      : prev.lines ?? null,
    durationMs: cost.total_duration_ms != null ? cost.total_duration_ms : prev.durationMs ?? null,
    t: Date.now(),
  };
  const same = JSON.stringify([prev.fiveHour, prev.sevenDay, prev.contextPct, prev.source, prev.cost, prev.model, prev.lines, prev.durationMs])
            === JSON.stringify([next.fiveHour, next.sevenDay, next.contextPct, next.source, next.cost, next.model, next.lines, next.durationMs]);
  if (same) return;
  state.ensureDirs();
  safeWrite(cachePath(root), JSON.stringify(next));
}

/** @param {UsageCache | null | undefined} cache @returns {number | null} */
function hp(cache) {
  if (!cache || !cache.fiveHour || cache.fiveHour.used == null) return null;
  return Math.max(0, Math.round(100 - cache.fiveHour.used));
}

/** Weekly Token % left (7-day window) — mirrors hp() for the 5h window.
 *  @param {UsageCache | null | undefined} cache @returns {number | null} */
function week(cache) {
  if (!cache || !cache.sevenDay || cache.sevenDay.used == null) return null;
  return Math.max(0, Math.round(100 - cache.sevenDay.used));
}

/** @param {UsageCache | null | undefined} cache @returns {string | null} */
function restTime(cache) {
  if (!cache || !cache.fiveHour || !cache.fiveHour.resetsAt) return null;
  const d = new Date(cache.fiveHour.resetsAt * 1000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

module.exports = { readCache, cacheFromStatusline, hp, week, restTime, cachePath };
