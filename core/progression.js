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
  // dmg (changed lines) is sub-linear and capped so one huge generated file can't
  // dwarf real effort: a 42-line fight ≈ 259, a 5000-line dump still caps at 300.
  const dmgXp = Math.min(300, Math.round(40 * Math.sqrt(Math.max(0, m.dmg || 0))));
  return 50 + dmgXp + (m.kills || 0) * 20 + (m.maxCombo || 0) * 5;
}

/** @typedef {import('./types').Profile} Profile */
/** @typedef {import('./types').BadgeDef} BadgeDef */

/** Declarative badge criteria — the add-a-badge seam (data/badges.json). */
const BADGES = /** @type {BadgeDef[]} */ (require('../data/badges.json'));

/** @typedef {import('./types').Quest} Quest */

/** Auto-quest templates — one active instance per kind. Targets are starting
 *  values; `streak_days` escalates by its base on each completion (see
 *  evaluateQuests), `weekly_kills` keeps a constant target and resets its window. */
const QUEST_DEFS = [
  { kind: /** @type {'weekly_kills'} */ ('weekly_kills'), target: 5, nameKey: 'quest.weeklyKills' },
  { kind: /** @type {'streak_days'} */ ('streak_days'),  target: 7, nameKey: 'quest.streakDays' },
];

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
    // Intentionally LOCAL time: "night owl" means coding after midnight in the user's own timezone.
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

/** Local calendar day as YYYY-MM-DD (NOT UTC — streaks track the user's own day).
 *  @param {number} ms epoch ms @returns {string} */
function dayStr(ms) {
  const d = new Date(ms);
  /** @param {number} n */
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Advance the activity streak at most once per local day. Same day = no-op,
 *  exactly-yesterday = +1, any gap = reset to 1. Mutates + returns profile.streak.
 *  @param {Profile} profile @param {number} now epoch ms
 *  @returns {{ days: number, lastActiveDay: string }} */
function bumpActivity(profile, now) {
  const today = dayStr(now);
  const s = profile.streak || { days: 0, lastActiveDay: '' };
  if (s.lastActiveDay !== today) {
    // local midnight today, minus 1ms → yesterday's local date (DST-safe)
    const midnight = new Date(now);
    midnight.setHours(0, 0, 0, 0);
    const yesterday = dayStr(midnight.getTime() - 1);
    s.days = s.lastActiveDay === yesterday ? (s.days || 0) + 1 : 1;
    s.lastActiveDay = today;
  }
  profile.streak = s;
  return s;
}

/** Current progress for a quest of the given kind.
 *  @param {Profile} profile @param {Quest} q @param {number} now @returns {number} */
function questProgress(profile, q, now) {
  if (q.kind === 'streak_days') return (profile.streak && profile.streak.days) || 0;
  if (q.kind === 'weekly_kills') {
    const windowStart = Math.max(q.startedAt, now - 7 * 86400000);
    return ((profile.milestones) || []).filter(
      (m) => typeof m.at === 'number' && m.at >= windowStart).length;
  }
  return 0;
}

/** Refresh auto-quest progress against `now`: seed a missing active quest per
 *  kind, recompute progress, and on completion stamp `doneAt`, roll a fresh
 *  active quest (window reset for weekly, target escalation for streak), and
 *  report the completed id. Mutates + returns profile.quests. Idempotent: a
 *  quest already carrying `doneAt` is never re-completed.
 *  @param {Profile} profile @param {number} now
 *  @returns {{ quests: Quest[], completed: string[] }} */
function evaluateQuests(profile, now) {
  const quests = (profile.quests || []).slice();
  const completed = [];
  for (const def of QUEST_DEFS) {
    let q = quests.find((x) => x.kind === def.kind && !x.doneAt);
    if (!q) {
      q = { id: def.kind, kind: def.kind, target: def.target, progress: 0, startedAt: now };
      quests.push(q);
    }
    q.progress = questProgress(profile, q, now);
    if (q.progress >= q.target && !q.doneAt) {
      q.doneAt = now;
      completed.push(q.id);
      const nextTarget = def.kind === 'streak_days' ? q.target + def.target : def.target;
      const next = { id: def.kind, kind: def.kind, target: nextTarget, progress: 0, startedAt: now };
      next.progress = questProgress(profile, next, now);
      quests.push(next);
    }
  }
  profile.quests = quests;
  return { quests, completed };
}

module.exports = { levelFor, xpForDefeat, xpToReach, TITLE_BANDS, BADGES, deriveStats, evaluateBadges, nameKeyFor, QUEST_DEFS, dayStr, bumpActivity, evaluateQuests };
