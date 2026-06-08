'use strict';
// progression — XP / level / title derived from the profile. Pure + deterministic.
// XP accrues per confirmed kill; levels cross fixed thresholds; a title bands the
// level. No project metrics, no IO — callers persist xp/level on the profile.

/** Title bands: the highest band whose `min` ≤ level wins. Keys live in
 *  data/locales/{en,zh}.json (locale.t resolves; en fallback). */
const TITLE_BANDS = [
  { min: 1,  key: 'title.novice' },
  { min: 3,  key: 'title.apprentice' },
  { min: 6,  key: 'title.adept' },
  { min: 10, key: 'title.veteran' },
  { min: 15, key: 'title.master' },
  { min: 21, key: 'title.grandmaster' },
];

/** Cumulative XP required to BE at level n: 50·n·(n-1).
 *  L1:0  L2:100  L3:300  L4:600  L5:1000  L6:1500 …
 *  @param {number} level @returns {number} */
function xpToReach(level) {
  return 50 * level * (level - 1);
}

/**
 * @param {number} xp
 * @returns {{ level: number, titleKey: string, nextAt: number, intoLevel: number, span: number }}
 */
function levelFor(xp) {
  const x = Math.max(0, Math.floor(Number(xp) || 0));
  let level = 1;
  while (xpToReach(level + 1) <= x) level++;
  let titleKey = TITLE_BANDS[0].key;
  for (const b of TITLE_BANDS) if (level >= b.min) titleKey = b.key;
  const base = xpToReach(level);
  const nextAt = xpToReach(level + 1);
  return { level, titleKey, nextAt, intoLevel: x - base, span: nextAt - base };
}

/** XP from one confirmed kill — rewards real fight stats (damage, kills, combo).
 *  @param {{ dmg?: number, kills?: number, maxCombo?: number }} [m] @returns {number} */
function xpForDefeat(m) {
  m = m || {};
  return 50 + (m.dmg || 0) + (m.kills || 0) * 20 + (m.maxCombo || 0) * 5;
}

/** @typedef {import('./types').Profile} Profile */
/** @typedef {import('./types').BadgeDef} BadgeDef */

/** Declarative badge criteria — the add-a-badge seam (data/badges.json). */
const BADGES = /** @type {BadgeDef[]} */ (require('../data/badges.json'));

/** Build the flat stat object every badge predicate checks. Pure; tolerates
 *  old profiles missing any field.
 *  @param {Profile} profile
 *  @returns {{ bossCount: number, kills: number, maxCombo: number, projects: number, nightKills: number, badgeCount: number }} */
function deriveStats(profile) {
  const ms = (profile && profile.milestones) || [];
  const totals = (profile && profile.totals) || { kills: 0 };
  let maxCombo = 0;
  let nightKills = 0;
  const projects = new Set();
  for (const m of ms) {
    if (typeof m.maxCombo === 'number' && m.maxCombo > maxCombo) maxCombo = m.maxCombo;
    if (m.project) projects.add(m.project);
    if (typeof m.at === 'number' && new Date(m.at).getHours() < 6) nightKills++;
  }
  return {
    bossCount: ms.length,
    kills: totals.kills || 0,
    maxCombo,
    projects: projects.size,
    nightKills,
    badgeCount: ((profile && profile.badges) || []).length,
  };
}

/** Ids of badges whose threshold is met and that the profile does not yet own.
 *  @param {Profile} profile @param {BadgeDef[]} [defs]
 *  @returns {string[]} */
function evaluateBadges(profile, defs = BADGES) {
  const stats = deriveStats(profile);
  const owned = new Set(((profile && profile.badges) || []).map((b) => b.id));
  const out = [];
  for (const d of defs) {
    if (owned.has(d.id)) continue;
    const v = /** @type {Record<string, number>} */ (stats)[d.stat];
    if (typeof v === 'number' && v >= d.gte) out.push(d.id);
  }
  return out;
}

/** @param {string} id @returns {string | undefined} the badge's locale nameKey */
function nameKeyFor(id) {
  const d = BADGES.find((b) => b.id === id);
  return d ? d.nameKey : undefined;
}

module.exports = { levelFor, xpForDefeat, xpToReach, TITLE_BANDS, BADGES, deriveStats, evaluateBadges, nameKeyFor };
