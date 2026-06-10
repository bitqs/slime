const os = require('node:os');
const path = require('node:path');
process.env.SLIME_ROOT = path.join(os.tmpdir(), 'slime-prog-test');
const { test } = require('node:test');
const assert = require('node:assert');
const prog = require('../core/progression');

test('levelFor: thresholds 50·n·(n-1) — L1:0 L2:100 L3:300 L4:600 L5:1000', () => {
  assert.equal(prog.levelFor(0).level, 1);
  assert.equal(prog.levelFor(99).level, 1);
  assert.equal(prog.levelFor(100).level, 2);
  assert.equal(prog.levelFor(299).level, 2);
  assert.equal(prog.levelFor(300).level, 3);
  assert.equal(prog.levelFor(600).level, 4);
  assert.equal(prog.levelFor(1000).level, 5);
});

test('levelFor: titles band by level', () => {
  assert.equal(prog.levelFor(prog.xpToReach(1)).titleKey, 'title.novice');
  assert.equal(prog.levelFor(prog.xpToReach(3)).titleKey, 'title.apprentice');
  assert.equal(prog.levelFor(prog.xpToReach(6)).titleKey, 'title.adept');
  assert.equal(prog.levelFor(prog.xpToReach(10)).titleKey, 'title.veteran');
  assert.equal(prog.levelFor(prog.xpToReach(15)).titleKey, 'title.master');
  assert.equal(prog.levelFor(prog.xpToReach(21)).titleKey, 'title.grandmaster');
});

test('levelFor: nextAt / intoLevel / span are consistent', () => {
  const r = prog.levelFor(150); // L2 (base 100, next 300)
  assert.equal(r.level, 2);
  assert.equal(r.nextAt, 300);
  assert.equal(r.intoLevel, 50);
  assert.equal(r.span, 200);
});

test('levelFor: tolerant of junk input', () => {
  assert.equal(prog.levelFor(undefined).level, 1);
  assert.equal(prog.levelFor(-50).level, 1);
  assert.equal(prog.levelFor('nope').level, 1);
});

test('xpForDefeat: 50 base + sqrt-capped dmg + kills·20 + maxCombo·5', () => {
  assert.equal(prog.xpForDefeat({}), 50);
  const dmgXp = Math.round(40 * Math.sqrt(42)); // sub-linear dmg term
  assert.equal(prog.xpForDefeat({ dmg: 42, kills: 3, maxCombo: 7 }), 50 + dmgXp + 60 + 35);
  assert.equal(prog.xpForDefeat(), 50);
  // dmg term is capped at 300 so a giant generated file can't dominate XP
  assert.equal(prog.xpForDefeat({ dmg: 5000 }), 50 + 300);
});

test('deriveStats: aggregates profile into badge stats', () => {
  const profile = {
    milestones: [
      { boss: 'A', date: '2026-06-01', turns: 2, project: '/p/x', at: Date.parse('2026-06-01T03:00:00'), maxCombo: 4 },
      { boss: 'B', date: '2026-06-02', turns: 3, project: '/p/y', at: Date.parse('2026-06-02T14:00:00'), maxCombo: 11 },
      { boss: 'C', date: '2026-06-03', turns: 1, project: '/p/x', at: Date.parse('2026-06-03T13:00:00'), maxCombo: 2 },
    ],
    totals: { turns: 6, dmg: 100, kills: 60 },
    badges: [{ id: 'first-blood', unlockedAt: 1 }],
  };
  const s = prog.deriveStats(profile);
  assert.equal(s.bossCount, 3);
  assert.equal(s.kills, 60);
  assert.equal(s.maxCombo, 11);
  assert.equal(s.projects, 2);       // /p/x, /p/y distinct
  assert.equal(s.nightKills, 1);     // only the 03:00 kill is < 6h
  assert.equal(s.badgeCount, 1);
});

test('deriveStats: empty/old profile defaults to zeros', () => {
  const s = prog.deriveStats({ milestones: [], totals: { turns: 0, dmg: 0, kills: 0 } });
  assert.deepEqual(s, { bossCount: 0, kills: 0, maxCombo: 0, projects: 0, nightKills: 0, badgeCount: 0 });
});

test('evaluateBadges: returns newly-satisfied ids, excludes owned', () => {
  const profile = {
    milestones: [
      { boss: 'A', date: '2026-06-01', turns: 1, project: '/p/x', at: Date.parse('2026-06-01T13:00:00'), maxCombo: 12 },
    ],
    totals: { turns: 1, dmg: 10, kills: 5 },
    badges: [{ id: 'first-blood', unlockedAt: 1 }],
  };
  // bossCount 1 → first-blood (owned, excluded); maxCombo 12 → combo-king (new)
  assert.deepEqual(prog.evaluateBadges(profile), ['combo-king']);
});

test('evaluateBadges: nothing new when all thresholds owned or unmet', () => {
  const profile = {
    milestones: [{ boss: 'A', date: '2026-06-01', turns: 1, project: '/p/x', at: Date.parse('2026-06-01T13:00:00') }],
    totals: { turns: 1, dmg: 0, kills: 0 },
    badges: [{ id: 'first-blood', unlockedAt: 1 }],
  };
  assert.deepEqual(prog.evaluateBadges(profile), []);
});

test('nameKeyFor: maps id to its locale key, undefined for unknown', () => {
  assert.equal(prog.nameKeyFor('combo-king'), 'badge.comboKing');
  assert.equal(prog.nameKeyFor('nope'), undefined);
});

test('evaluateBadges: veteran unlocks at exactly 25 bosses, not 24', () => {
  const mk = (n) => ({ milestones: Array.from({ length: n }, (_, i) => ({ boss: 'B' + i, date: '2026-06-01', turns: 1, project: '/p/x' })), totals: { turns: n, dmg: 0, kills: 0 }, badges: [] });
  assert.ok(!prog.evaluateBadges(mk(24)).includes('veteran'));
  assert.ok(prog.evaluateBadges(mk(25)).includes('veteran'));
});

test('evaluateBadges: slayer at kills>=50, polyglot at projects>=3', () => {
  const profile = {
    milestones: [
      { boss: 'A', date: '2026-06-01', turns: 1, project: '/p/a' },
      { boss: 'B', date: '2026-06-01', turns: 1, project: '/p/b' },
      { boss: 'C', date: '2026-06-01', turns: 1, project: '/p/c' },
    ],
    totals: { turns: 3, dmg: 0, kills: 50 },
    badges: [],
  };
  const got = prog.evaluateBadges(profile);
  assert.ok(got.includes('slayer'));     // kills 50
  assert.ok(got.includes('polyglot'));   // 3 distinct projects
});

test('evaluateBadges: returns multiple new badges at once', () => {
  const profile = {
    milestones: [{ boss: 'A', date: '2026-06-01', turns: 1, project: '/p/x', maxCombo: 12 }],
    totals: { turns: 1, dmg: 0, kills: 0 },
    badges: [],
  };
  const got = prog.evaluateBadges(profile);
  // bossCount 1 → first-blood; maxCombo 12 → combo-king
  assert.ok(got.includes('first-blood') && got.includes('combo-king'));
});

test('dayStr: local YYYY-MM-DD', () => {
  const ms = new Date(2026, 5, 8, 14, 30).getTime(); // local June 8 2026
  assert.equal(prog.dayStr(ms), '2026-06-08');
});

test('bumpActivity: first activity seeds streak at 1', () => {
  const p = {};
  prog.bumpActivity(p, new Date(2026, 5, 8, 10).getTime());
  assert.equal(p.streak.days, 1);
  assert.equal(p.streak.lastActiveDay, '2026-06-08');
  assert.equal(p.streak.longest, 1);
});

test('bumpActivity: same day is a no-op', () => {
  const p = { streak: { days: 3, lastActiveDay: '2026-06-08' } };
  prog.bumpActivity(p, new Date(2026, 5, 8, 23).getTime());
  assert.equal(p.streak.days, 3);
  assert.equal(p.streak.lastActiveDay, '2026-06-08');
});

test('bumpActivity: consecutive day increments', () => {
  const p = { streak: { days: 3, lastActiveDay: '2026-06-07' } };
  prog.bumpActivity(p, new Date(2026, 5, 8, 9).getTime());
  assert.equal(p.streak.days, 4);
  assert.equal(p.streak.lastActiveDay, '2026-06-08');
  assert.equal(p.streak.longest, 4);
});

test('bumpActivity: an unfrozen gap resets the streak to 1 (best preserved)', () => {
  const p = { streak: { days: 9, lastActiveDay: '2026-06-05', freezes: 0 } };
  prog.bumpActivity(p, new Date(2026, 5, 8, 9).getTime()); // 2-day gap, no freezes
  assert.equal(p.streak.days, 1);
  assert.equal(p.streak.longest, 9);
});

test('bumpActivity: a streak-freeze forgives a gap and keeps the streak alive', () => {
  const p = { streak: { days: 8, lastActiveDay: '2026-06-06', freezes: 2 } };
  prog.bumpActivity(p, new Date(2026, 5, 8, 9).getTime()); // 1 missed day → spend 1 freeze
  assert.equal(p.streak.days, 9);
  assert.equal(p.streak.freezes, 1);
});

test('bumpActivity: earns a streak-freeze every 5 days (capped)', () => {
  const p = { streak: { days: 4, lastActiveDay: '2026-06-07', freezes: 0 } };
  prog.bumpActivity(p, new Date(2026, 5, 8, 9).getTime()); // day 5 → +1 freeze
  assert.equal(p.streak.days, 5);
  assert.equal(p.streak.freezes, 1);
});

test('evaluateQuests: seeds one active quest per kind on a blank profile', () => {
  const p = { milestones: [] };
  const now = new Date(2026, 5, 8, 12).getTime();
  const { quests, completed } = prog.evaluateQuests(p, now);
  assert.equal(completed.length, 0);
  assert.deepEqual(quests.map((q) => q.kind).sort(), ['streak_days', 'weekly_kills']);
  assert.ok(quests.every((q) => q.progress === 0 && q.startedAt === now && !q.doneAt));
});

test('evaluateQuests: weekly_kills counts milestones inside the rolling 7-day window', () => {
  const now = new Date(2026, 5, 8, 12).getTime();
  const day = 86400000;
  const p = { milestones: [
    { at: now - 1 * day }, { at: now - 2 * day }, { at: now - 9 * day }, // 9d ago is outside
  ] };
  prog.evaluateQuests(p, now); // seed (startedAt = now → window start = now, nothing counts yet)
  // back-date the seeded quest so the window opens 7d back
  p.quests.find((q) => q.kind === 'weekly_kills').startedAt = now - 7 * day;
  const { completed } = prog.evaluateQuests(p, now);
  const wk = p.quests.find((q) => q.kind === 'weekly_kills' && !q.doneAt);
  assert.equal(wk.progress, 2);          // two kills inside the window
  assert.equal(completed.length, 0);     // target 5 not met
});

test('evaluateQuests: weekly_kills completes, rolls a fresh window-reset quest', () => {
  const now = new Date(2026, 5, 8, 12).getTime();
  const day = 86400000;
  const ms = [];
  for (let i = 1; i <= 5; i++) ms.push({ at: now - i * 3600000 }); // 5 kills today
  const p = { milestones: ms };
  prog.evaluateQuests(p, now); // seed
  p.quests.find((q) => q.kind === 'weekly_kills').startedAt = now - 7 * day;
  const { completed } = prog.evaluateQuests(p, now);
  assert.deepEqual(completed, ['weekly_kills']);
  const active = p.quests.filter((q) => q.kind === 'weekly_kills' && !q.doneAt);
  assert.equal(active.length, 1);
  assert.equal(active[0].startedAt, now);   // window reset
  assert.equal(active[0].progress, 0);      // nothing after `now`
  assert.equal(active[0].target, 5);        // constant target
});

test('evaluateQuests: streak_days completes and escalates the next target', () => {
  const p = { milestones: [], streak: { days: 7, lastActiveDay: '2026-06-08' } };
  const now = new Date(2026, 5, 8, 12).getTime();
  const { completed } = prog.evaluateQuests(p, now);
  assert.deepEqual(completed, ['streak_days']);
  const active = p.quests.find((q) => q.kind === 'streak_days' && !q.doneAt);
  assert.equal(active.target, 14);   // 7 + 7 escalation
  assert.equal(active.progress, 7);  // absolute streak; below the new target
});

test('evaluateQuests: completing a quest pays its XP into the profile', () => {
  const now = new Date(2026, 5, 8, 12).getTime();
  const day = 86400000;
  const ms = [];
  for (let i = 1; i <= 5; i++) ms.push({ at: now - i * 3600000 });
  const p = { milestones: ms, xp: 0 };
  prog.evaluateQuests(p, now); // seed
  p.quests.find((q) => q.kind === 'weekly_kills').startedAt = now - 7 * day;
  const { completed, xpGained } = prog.evaluateQuests(p, now);
  assert.deepEqual(completed, ['weekly_kills']);
  const def = prog.QUEST_DEFS.find((d) => d.kind === 'weekly_kills');
  assert.equal(xpGained, def.xp);
  assert.equal(p.xp, def.xp);
});

test('evaluateQuests: quest XP honors the prestige multiplier', () => {
  const p = { milestones: [], streak: { days: 7, lastActiveDay: '2026-06-08' }, xp: 0, prestige: 2 };
  const now = new Date(2026, 5, 8, 12).getTime();
  const { completed, xpGained } = prog.evaluateQuests(p, now); // completes streak 7/7
  assert.deepEqual(completed, ['streak_days']);
  const def = prog.QUEST_DEFS.find((d) => d.kind === 'streak_days');
  assert.equal(xpGained, Math.round(def.xp * 1.5)); // prestige 2 → ×1.5
  assert.equal(p.xp, xpGained);
});

test('evaluateQuests: no completion → zero xpGained, profile xp untouched', () => {
  const p = { milestones: [], xp: 77 };
  const { xpGained } = prog.evaluateQuests(p, new Date(2026, 5, 8, 12).getTime());
  assert.equal(xpGained, 0);
  assert.equal(p.xp, 77);
});

test('evaluateQuests: a completed quest is not re-completed on the next call', () => {
  const p = { milestones: [], streak: { days: 7, lastActiveDay: '2026-06-08' } };
  const now = new Date(2026, 5, 8, 12).getTime();
  prog.evaluateQuests(p, now);                       // completes streak (7/7)
  const second = prog.evaluateQuests(p, now);         // target now 14, streak still 7
  assert.equal(second.completed.length, 0);
});

test('bumpActivity: increments across a month boundary', () => {
  const p = { streak: { days: 4, lastActiveDay: '2026-04-30' } };
  prog.bumpActivity(p, new Date(2026, 4, 1, 9).getTime()); // local May 1 2026
  assert.equal(p.streak.days, 5);
  assert.equal(p.streak.lastActiveDay, '2026-05-01');
});

test('bumpActivity: increments across a year boundary', () => {
  const p = { streak: { days: 9, lastActiveDay: '2025-12-31' } };
  prog.bumpActivity(p, new Date(2026, 0, 1, 9).getTime()); // local Jan 1 2026
  assert.equal(p.streak.days, 10);
  assert.equal(p.streak.lastActiveDay, '2026-01-01');
});

test('defeat-flow: rewardLines includes a quest line for newQuests', () => {
  const flow = require('../core/defeat-flow');
  const lines = flow.rewardLines(
    { leveledUp: false, newBadges: [], newQuests: ['weekly_kills'] }, 'en');
  assert.equal(lines.length, 1);
  assert.match(lines[0], /Quest complete/);
  assert.match(lines[0], /Weekly Hunter/);
});

test('defeat-flow: questText resolves zh name', () => {
  const flow = require('../core/defeat-flow');
  const lines = flow.rewardLines(
    { leveledUp: false, newBadges: [], newQuests: ['streak_days'] }, 'zh');
  assert.match(lines[0], /每日修行/);
});

test('nearestQuest: picks the active quest closest to completion (highest ratio)', () => {
  const p = { quests: [
    { id: 'weekly_kills', kind: 'weekly_kills', target: 5, progress: 4, startedAt: 1 }, // 0.8
    { id: 'streak_days',  kind: 'streak_days',  target: 7, progress: 1, startedAt: 1 }, // 0.14
  ] };
  assert.equal(prog.nearestQuest(p).kind, 'weekly_kills');
});

test('nearestQuest: prefers the closer ratio even when absolute progress is lower', () => {
  const p = { quests: [
    { id: 'streak_days',  kind: 'streak_days',  target: 14, progress: 6, startedAt: 1 }, // 0.43
    { id: 'weekly_kills', kind: 'weekly_kills', target: 5,  progress: 4, startedAt: 1 }, // 0.8
  ] };
  assert.equal(prog.nearestQuest(p).kind, 'weekly_kills');
});

test('nearestQuest: ignores completed (doneAt) quests', () => {
  const p = { quests: [
    { id: 'weekly_kills', kind: 'weekly_kills', target: 5, progress: 5, startedAt: 1, doneAt: 9 },
    { id: 'streak_days',  kind: 'streak_days',  target: 7, progress: 2, startedAt: 1 },
  ] };
  assert.equal(prog.nearestQuest(p).kind, 'streak_days');
});

test('nearestQuest: null when no active quests / missing / empty', () => {
  assert.equal(prog.nearestQuest({ quests: [{ kind: 'x', target: 1, progress: 1, startedAt: 1, doneAt: 2 }] }), null);
  assert.equal(prog.nearestQuest({ quests: [] }), null);
  assert.equal(prog.nearestQuest({}), null);
});

test('prestige: refuses below the minimum level', () => {
  const p = { xp: 0 };
  const r = prog.prestige(p);
  assert.equal(r.ok, false);
  assert.equal(p.prestige, undefined); // unchanged
  assert.equal(p.xp, 0);
});

test('prestige: ascends, resets xp, bumps tier + multiplier', () => {
  const p = { xp: prog.xpToReach(prog.PRESTIGE_MIN_LEVEL) + 5 };
  assert.equal(prog.canPrestige(p), true);
  const r = prog.prestige(p);
  assert.equal(r.ok, true);
  assert.equal(r.prestige, 1);
  assert.equal(p.xp, 0);          // level/xp reset
  assert.equal(p.prestige, 1);
  assert.equal(prog.prestigeMult(p), 1.25); // +25% per tier
});
