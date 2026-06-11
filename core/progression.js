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

/** Reward-side level scaling (ATOM-P02 constant cadence): demand stays
 *  50·n·(n−1) — old saves migrate for free — while supply grows with level,
 *  so kills/level converges (to ~2.7 for a typical fight) instead of slowing forever; early levels come faster,
 *  and the same punch prints a bigger number. @param {number} [level] @returns {number} */
function levelScale(level) {
  return 1 + 0.12 * Math.max(0, (level || 1) - 1);
}

/** In-fight power curve (ATOM-P14 two-curves race): boss HP damage scales
 *  with the live combo so a fight reads grind → surge; one miss resets to the
 *  grind. Visual layer only — XP always reads raw dmg.
 *  @param {number} combo @param {number} [cap] cap floored at 1 @returns {number} */
function comboDmgMult(combo, cap = 2) {
  return Math.min(Math.max(1, cap), 1 + 0.08 * Math.max(0, combo || 0));
}

/** @typedef {import('./types').Profile} Profile */
/** @typedef {import('./types').BadgeDef} BadgeDef */

/** Declarative badge criteria — the add-a-badge seam (data/badges.json). */
const BADGES = /** @type {BadgeDef[]} */ (require('../data/badges.json'));

/** @typedef {import('./types').Quest} Quest */

/** Auto-quest templates — one active instance per kind. Targets are starting
 *  values; `streak_days` escalates by its base on each completion (see
 *  evaluateQuests), `weekly_kills` keeps a constant target and resets its window.
 *  `xp` pays on completion (≈ a third of a typical boss) so the 🎯 meter the
 *  statusline tracks is never a zero-reward goal. */
const QUEST_DEFS = [
  { kind: /** @type {'weekly_kills'} */ ('weekly_kills'), target: 5, nameKey: 'quest.weeklyKills', xp: 150 },
  { kind: /** @type {'streak_days'} */ ('streak_days'),  target: 7, nameKey: 'quest.streakDays',  xp: 100 },
];

/** XP paid per badge unlock (applied by recordDefeat, prestige-multiplied). */
const BADGE_XP = 100;

/** Build the flat stat object every badge predicate checks. Pure; tolerates
 *  old profiles missing any field.
 *  @param {Profile} profile
 *  @returns {{ bossCount: number, kills: number, maxCombo: number, projects: number, nightKills: number, badgeCount: number, longestStreak: number }} */
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
    longestStreak: (profile && profile.streak && profile.streak.longest) || 0,
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

/** Whole calendar days from YYYY-MM-DD `a` to `b` (UTC-anchored so it's DST- and
 *  tz-shift-proof — the day strings already encode the user's local day).
 *  @param {string} a @param {string} b @returns {number} */
function daysBetween(a, b) {
  const pa = a.split('-').map(Number), pb = b.split('-').map(Number);
  if (pa.length !== 3 || pb.length !== 3) return NaN;
  return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86400000);
}

// earn one streak-freeze every N active days; never hold more than this many.
const FREEZE_EVERY = 5;
const FREEZE_MAX = 2;

/** Advance the activity streak at most once per local day. Same day = no-op;
 *  yesterday = +1; a gap is forgiven by spending streak-freezes (one per missed
 *  day) so a day off doesn't punish — only an *unfrozen* gap resets to 1. Tracks
 *  `longest` and earns a freeze every {@link FREEZE_EVERY} days (cap {@link FREEZE_MAX}).
 *  Mutates + returns profile.streak.
 *  @param {Profile} profile @param {number} now epoch ms
 *  @returns {{ days: number, lastActiveDay: string, longest: number, freezes: number, freezeMax: number }} */
function bumpActivity(profile, now) {
  const today = dayStr(now);
  const s = /** @type {{ days: number, lastActiveDay: string, longest?: number, freezes?: number, freezeMax?: number }} */ (
    profile.streak || { days: 0, lastActiveDay: '' });
  if (s.freezeMax == null) s.freezeMax = FREEZE_MAX;
  if (s.freezes == null) s.freezes = 0;
  if (s.longest == null) s.longest = s.days || 0;

  if (s.lastActiveDay !== today) {
    if (!s.lastActiveDay) {
      s.days = 1;
    } else {
      const gap = daysBetween(s.lastActiveDay, today);
      if (gap === 1) {
        s.days = (s.days || 0) + 1;                 // consecutive day
      } else if (gap > 1) {
        const missed = gap - 1;                     // full days skipped
        if ((s.freezes || 0) >= missed) {
          s.freezes -= missed;                      // freezes cover the gap → streak lives
          s.days = (s.days || 0) + 1;
        } else {
          s.days = 1;                               // unfrozen gap → reset
        }
      }
      // gap <= 0 (same day handled above / clock skew): leave days untouched
    }
    s.lastActiveDay = today;
    if (s.days > 0 && s.days % FREEZE_EVERY === 0 && s.freezes < s.freezeMax) s.freezes += 1;
    if (s.days > (s.longest || 0)) s.longest = s.days;
  }
  profile.streak = /** @type {Profile['streak']} */ (s);
  return /** @type {{ days: number, lastActiveDay: string, longest: number, freezes: number, freezeMax: number }} */ (s);
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
 *  kind, recompute progress, and on completion stamp `doneAt`, pay the quest's
 *  XP (prestige-multiplied) into the profile, roll a fresh active quest (window
 *  reset for weekly, target escalation for streak), and report the completed id.
 *  Mutates + returns profile.quests. Idempotent: a quest already carrying
 *  `doneAt` is never re-completed. Callers persist xp/level on the profile.
 *  @param {Profile} profile @param {number} now
 *  @returns {{ quests: Quest[], completed: string[], xpGained: number }} */
function evaluateQuests(profile, now) {
  const quests = (profile.quests || []).slice();
  const completed = [];
  let xpGained = 0;
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
      xpGained += Math.round((def.xp || 0) * prestigeMult(profile));
      const nextTarget = def.kind === 'streak_days' ? q.target + def.target : def.target;
      const next = { id: def.kind, kind: def.kind, target: nextTarget, progress: 0, startedAt: now };
      next.progress = questProgress(profile, next, now);
      quests.push(next);
    }
  }
  if (xpGained) profile.xp = (profile.xp || 0) + xpGained;
  profile.quests = quests;
  return { quests, completed, xpGained };
}

/** The active (not-yet-done) quest closest to completion, by progress/target
 *  ratio. Ties resolve to array order. Null if no active quest. Pure.
 *  @param {Profile} profile @returns {Quest | null} */
function nearestQuest(profile) {
  const active = ((profile && profile.quests) || []).filter((q) => !q.doneAt);
  let best = null;
  let bestRatio = -1;
  for (const q of active) {
    const ratio = q.target > 0 ? q.progress / q.target : 0;
    if (ratio > bestRatio) { bestRatio = ratio; best = q; }
  }
  return best;
}

// ── prestige / New Game+ ────────────────────────────────────────────────────
// Voluntarily reset level + xp for a permanent xp multiplier. Badges, streak and
// milestones are kept — only level/xp reset. Opt-in (never automatic).
const PRESTIGE_MIN_LEVEL = 10;     // must reach this to ascend
const PRESTIGE_XP_BONUS = 0.25;    // +25% xp gain per prestige tier

/** Permanent xp-gain multiplier from prestige tiers. @param {Profile} profile @returns {number} */
function prestigeMult(profile) {
  return 1 + PRESTIGE_XP_BONUS * ((profile && profile.prestige) || 0);
}
/** @param {Profile} profile @returns {boolean} */
function canPrestige(profile) {
  return levelFor((profile && profile.xp) || 0).level >= PRESTIGE_MIN_LEVEL;
}
/** Ascend: bump the prestige tier and reset xp to 0 (keeps badges/streak/milestones).
 *  Refuses below {@link PRESTIGE_MIN_LEVEL}. Mutates + returns the outcome.
 *  @param {Profile} profile
 *  @returns {{ ok: true, prestige: number, mult: number } | { ok: false, reason: string, minLevel: number }} */
function prestige(profile) {
  if (!canPrestige(profile)) return { ok: false, reason: 'level', minLevel: PRESTIGE_MIN_LEVEL };
  profile.prestige = (profile.prestige || 0) + 1;
  profile.xp = 0;
  return { ok: true, prestige: profile.prestige, mult: prestigeMult(profile) };
}

module.exports = { levelFor, xpForDefeat, xpToReach, levelScale, comboDmgMult, TITLE_BANDS, BADGES, BADGE_XP, deriveStats, evaluateBadges, nameKeyFor, QUEST_DEFS, dayStr, bumpActivity, evaluateQuests, nearestQuest, prestigeMult, canPrestige, prestige, PRESTIGE_MIN_LEVEL };
