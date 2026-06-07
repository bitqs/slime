/** @typedef {import('./types').BossState} BossState */
/** @typedef {import('./types').UsageCache} UsageCache */
/** @typedef {import('./types').QLEvent} QLEvent */

/**
 * @typedef {{ dmg?: number; kills?: number; hits?: number }} RankInput
 */

/** @param {RankInput} param0 @returns {string} */
function rank({ hits = 0, kills = 0, dmg = 0 }) {
  if (hits === 0 && kills > 0) return 'S';
  if (hits === 0 && dmg > 0) return 'A';
  if (hits === 0) return 'B'; // read-only / scouting turn
  if (hits <= 1) return 'A';
  if (hits <= 3) return 'B';
  return 'C';
}

/** @param {QLEvent[]} events @returns {{ dmg: number; kills: number; hits: number; casts: number; maxCombo: number }} */
function aggregate(events) {
  const lastEnd = events.map((e) => e.kind).lastIndexOf('turn_end');
  const turn = events.slice(lastEnd + 1);
  let combo = 0, maxCombo = 0;
  const a = { dmg: 0, kills: 0, hits: 0, casts: 0, maxCombo: 0 };
  for (const e of turn) {
    if (e.kind === 'cast') a.casts++;
    if (e.kind === 'resolve') {
      if (e.dmg) { a.dmg += e.dmg; combo++; maxCombo = Math.max(maxCombo, combo); }
      if (e.kill) a.kills++;
      if (e.hit) { a.hits++; combo = 0; }
    }
  }
  a.maxCombo = maxCombo;
  return a;
}

/** @param {number} pct @returns {string} */
function bar(pct) {
  const full = Math.round(pct / 10);
  return '█'.repeat(full) + '░'.repeat(10 - full);
}

/**
 * @typedef {{ dmg: number; kills: number; hits: number; casts: number; maxCombo: number }} AggResult
 * @typedef {{ turn?: number | string; [key: string]: unknown }} SnapLike
 * @typedef {{ lang?: string; usage?: UsageCache | null; sageLine?: string }} RenderExtras
 */

/**
 * @param {AggResult} agg
 * @param {BossState | null | undefined} bossState
 * @param {SnapLike} snap
 * @param {RenderExtras} [extras]
 * @returns {string}
 */
function render(agg, bossState, snap, extras = {}) {
  const locale = require('./locale');
  const lang = extras.lang || locale.current();
  /** @param {string} key @param {Record<string, unknown>} [vars] @returns {string} */
  const T = (key, vars) => locale.fmt(locale.t(key, lang), vars);
  const r = rank(agg);
  const lines = [
    T('report.header', { turn: snap.turn || '?', rank: r }),
    bossState ? T('report.boss', { name: bossState.name, bar: bar(bossState.hp), hp: bossState.hp }) : null,
    T('report.stats', { dmg: agg.dmg, kills: agg.kills, hits: agg.hits, maxCombo: agg.maxCombo }),
  ].filter(Boolean);
  const u = extras.usage;
  if (u && u.fiveHour && u.fiveHour.used != null) {
    const hp = Math.max(0, Math.round(100 - u.fiveHour.used));
    const weekly = u.sevenDay && u.sevenDay.used != null
      ? T('report.weekly', { bar: bar(100 - u.sevenDay.used), pct: Math.round(100 - u.sevenDay.used) }) : '';
    lines.push(T('report.stamina', { bar: bar(hp), hp, weekly }));
  }
  if (bossState && bossState.hp <= 20) {
    lines.push(T('report.stagger', { name: bossState.name }));
  }
  if (extras.sageLine) lines.push(extras.sageLine);
  return lines.join('\n');
}

module.exports = { rank, aggregate, render, bar };
