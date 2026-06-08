# Progression Phase 4 — Quests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two auto-generated quests — `weekly_kills` (kill N bosses inside a rolling 7-day window) and `streak_days` (N consecutive active days) — that refresh on defeat / turn-end, emit a `quest_done` event when met, roll the next, and surface in `/slime:achievements` and the arena.

**Architecture:** Quest logic is pure in `core/progression.js` (`bumpActivity`, `evaluateQuests`, `QUEST_DEFS`) — no IO, fully unit-tested. `boss.recordDefeat` evaluates quests after a kill (catches `weekly_kills`); `scripts/hook-stop.js` runs a per-turn activity tick (`bumpActivity` + `evaluateQuests`, catches `streak_days`). Completed quest ids flow through `core/defeat-flow.js` (`emitQuests`, extended `emitRewards`/`rewardLines`) so the `quest_done` event shape lives in one place — same pattern Phase 2/3 used for `level_up`/`badge_unlocked`. Profiles back-fill: all quest fields are optional, seeded on first evaluate.

**Tech Stack:** Node ≥20 builtin `node:test`/`assert`, JSDoc + `tsc --checkJs` (strict), flat i18n catalogs `data/locales/{en,zh}.json`. No new deps, no build step.

---

## File Structure

- Modify `core/types.d.ts` — add the `Quest` interface (replace the inline `quests?` shape).
- Modify `core/progression.js` — add `QUEST_DEFS`, `bumpActivity`, `evaluateQuests`, `dayStr`; export them.
- Modify `data/locales/en.json` + `data/locales/zh.json` — quest name + `quest.done` + `ach.quests*` keys.
- Modify `core/boss.js` — `recordDefeat` evaluates quests, returns `newQuests`.
- Modify `core/defeat-flow.js` — `emitQuests`, and emit/print quest completions in `emitRewards`/`rewardLines`.
- Modify `scripts/hook-stop.js` — per-turn activity tick + `emitQuests`.
- Modify `scripts/achievements.js` — render the active-quest section.
- Modify `public/arena.js` — `quest_done` reuses the `levelup` cutscene (one line).
- Create/extend tests: `test/progression.test.js`, `test/locale-badges.test.js`, `test/achievements.test.js`, `test/boss.test.js` (or wherever `recordDefeat` is tested — see Task 3).

**Quest model (locked decisions):**
- One **active** quest per kind = the one with no `doneAt`. Completed quests stay in the array as history (carry `doneAt`).
- `weekly_kills`: progress = count of milestones with `at ≥ max(quest.startedAt, now − 7d)`. Target constant `5`. On completion the rolled quest's `startedAt = now`, so the window reset alone prevents instant re-completion.
- `streak_days`: progress = `profile.streak.days` (absolute). Target starts `7`; on completion the rolled quest's target **escalates** (`+7`) so an absolute streak can't re-complete the same target next tick.
- `bumpActivity` advances the streak at most once per local calendar day: same day = no-op, exactly-yesterday = `+1`, any gap = reset to `1`. "Yesterday" is computed from local midnight (DST-safe), not `now − 24h`.
- All time inputs are passed in as `now` (epoch ms) so the engine is deterministic under test.

---

### Task 1: Quest type, `QUEST_DEFS`, and locale keys

**Files:**
- Modify: `core/types.d.ts:71` (the inline `quests?` line)
- Modify: `core/progression.js` (add `QUEST_DEFS` + export)
- Modify: `data/locales/en.json`, `data/locales/zh.json`
- Test: `test/locale-badges.test.js` (append a quest-keys test)

- [ ] **Step 1: Replace the inline `quests?` type with a named `Quest` interface**

In `core/types.d.ts`, the `Profile` interface currently has:

```ts
  quests?: Array<{ id: string; kind: string; target: number; progress: number; startedAt: number; doneAt?: number }>;
```

Replace that single line with:

```ts
  quests?: Quest[];
```

Then add this interface immediately **before** `export interface Profile {`:

```ts
export interface Quest {
  id: string;                            // == kind for the active instance
  kind: 'weekly_kills' | 'streak_days';
  target: number;
  progress: number;
  startedAt: number;                     // epoch ms
  doneAt?: number;                       // epoch ms when completed
}
```

- [ ] **Step 2: Add `QUEST_DEFS` to `core/progression.js`**

In `core/progression.js`, immediately after the `BADGES` declaration
(`const BADGES = /** @type {BadgeDef[]} */ (require('../data/badges.json'));`), add:

```js
/** @typedef {import('./types').Quest} Quest */

/** Auto-quest templates — one active instance per kind. Targets are starting
 *  values; `streak_days` escalates by its base on each completion (see
 *  evaluateQuests), `weekly_kills` keeps a constant target and resets its window. */
const QUEST_DEFS = [
  { kind: /** @type {'weekly_kills'} */ ('weekly_kills'), target: 5, nameKey: 'quest.weeklyKills' },
  { kind: /** @type {'streak_days'} */ ('streak_days'),  target: 7, nameKey: 'quest.streakDays' },
];
```

- [ ] **Step 3: Export `QUEST_DEFS`**

In the `module.exports = { ... }` line at the bottom of `core/progression.js`, add `QUEST_DEFS` to the list (engine functions are added in Task 2):

```js
module.exports = { levelFor, xpForDefeat, xpToReach, TITLE_BANDS, BADGES, deriveStats, evaluateBadges, nameKeyFor, QUEST_DEFS };
```

- [ ] **Step 4: Add English locale keys**

In `data/locales/en.json`, change the last achievements line to add a comma and append the quest keys. The block currently ends:

```json
  "ach.badgesHeader": "Badges ({owned}/{total})",
  "ach.locked": "locked"
```

Replace with:

```json
  "ach.badgesHeader": "Badges ({owned}/{total})",
  "ach.locked": "locked",
  "ach.questsHeader": "Quests",
  "ach.questLine": "  🎯 {name}  {progress}/{target}",
  "quest.weeklyKills": "Weekly Hunter",
  "quest.streakDays": "Daily Grind",
  "quest.done": "🎯 Quest complete — {name}"
```

- [ ] **Step 5: Add Chinese locale keys**

In `data/locales/zh.json`, the block currently ends:

```json
  "ach.badgesHeader": "徽章 ({owned}/{total})",
  "ach.locked": "未解锁"
```

Replace with:

```json
  "ach.badgesHeader": "徽章 ({owned}/{total})",
  "ach.locked": "未解锁",
  "ach.questsHeader": "任务",
  "ach.questLine": "  🎯 {name}  {progress}/{target}",
  "quest.weeklyKills": "每周猎手",
  "quest.streakDays": "每日修行",
  "quest.done": "🎯 任务完成 — {name}"
```

- [ ] **Step 6: Write the locale-completeness test**

Append to `test/locale-badges.test.js`:

```js
const progression = require('../core/progression');

test('QUEST_DEFS: kinds unique, nameKey resolves in en and zh', () => {
  const kinds = progression.QUEST_DEFS.map((q) => q.kind);
  assert.equal(new Set(kinds).size, kinds.length, 'duplicate quest kind');
  const en = read('en');
  const zh = read('zh');
  for (const d of progression.QUEST_DEFS) {
    assert.equal(typeof d.target, 'number');
    assert.ok(en[d.nameKey], `en missing ${d.nameKey}`);
    assert.ok(zh[d.nameKey], `zh missing ${d.nameKey}`);
  }
});

test('quest.done + ach.quest* keys exist in both catalogs', () => {
  const en = read('en');
  const zh = read('zh');
  for (const k of ['quest.done', 'ach.questsHeader', 'ach.questLine']) {
    assert.ok(en[k], `en missing ${k}`);
    assert.ok(zh[k], `zh missing ${k}`);
  }
});
```

- [ ] **Step 7: Run the new tests — verify they pass**

Run: `node --test test/locale-badges.test.js`
Expected: PASS (all subtests ok).

- [ ] **Step 8: Typecheck**

Run: `npm run typecheck`
Expected: no errors (the `Quest` type and `QUEST_DEFS` JSDoc resolve).

- [ ] **Step 9: Commit**

```bash
git add core/types.d.ts core/progression.js data/locales/en.json data/locales/zh.json test/locale-badges.test.js
git commit -m "feat(progression): quest types, QUEST_DEFS templates, locale keys"
```

---

### Task 2: Engine — `bumpActivity` + `evaluateQuests`

**Files:**
- Modify: `core/progression.js`
- Test: `test/progression.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/progression.test.js`:

```js
test('dayStr: local YYYY-MM-DD', () => {
  const ms = new Date(2026, 5, 8, 14, 30).getTime(); // local June 8 2026
  assert.equal(prog.dayStr(ms), '2026-06-08');
});

test('bumpActivity: first activity seeds streak at 1', () => {
  const p = {};
  const now = new Date(2026, 5, 8, 10).getTime();
  prog.bumpActivity(p, now);
  assert.deepEqual(p.streak, { days: 1, lastActiveDay: '2026-06-08' });
});

test('bumpActivity: same day is a no-op', () => {
  const p = { streak: { days: 3, lastActiveDay: '2026-06-08' } };
  prog.bumpActivity(p, new Date(2026, 5, 8, 23).getTime());
  assert.deepEqual(p.streak, { days: 3, lastActiveDay: '2026-06-08' });
});

test('bumpActivity: consecutive day increments', () => {
  const p = { streak: { days: 3, lastActiveDay: '2026-06-07' } };
  prog.bumpActivity(p, new Date(2026, 5, 8, 9).getTime());
  assert.deepEqual(p.streak, { days: 4, lastActiveDay: '2026-06-08' });
});

test('bumpActivity: a gap resets the streak to 1', () => {
  const p = { streak: { days: 9, lastActiveDay: '2026-06-05' } };
  prog.bumpActivity(p, new Date(2026, 5, 8, 9).getTime());
  assert.deepEqual(p.streak, { days: 1, lastActiveDay: '2026-06-08' });
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

test('evaluateQuests: a completed quest is not re-completed on the next call', () => {
  const p = { milestones: [], streak: { days: 7, lastActiveDay: '2026-06-08' } };
  const now = new Date(2026, 5, 8, 12).getTime();
  prog.evaluateQuests(p, now);                       // completes streak (7/7)
  const second = prog.evaluateQuests(p, now);         // target now 14, streak still 7
  assert.equal(second.completed.length, 0);
});
```

- [ ] **Step 2: Run the new tests — verify they fail**

Run: `node --test test/progression.test.js`
Expected: FAIL — `prog.dayStr is not a function` / `prog.bumpActivity is not a function` / `prog.evaluateQuests is not a function`.

- [ ] **Step 3: Implement the engine**

In `core/progression.js`, add these functions after `nameKeyFor` (before `module.exports`):

```js
/** Local calendar day as YYYY-MM-DD (NOT UTC — streaks track the user's own day).
 *  @param {number} ms epoch ms @returns {string} */
function dayStr(ms) {
  const d = new Date(ms);
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
      quests.push({ id: def.kind, kind: def.kind, target: nextTarget, progress: 0, startedAt: now });
    }
  }
  profile.quests = quests;
  return { quests, completed };
}
```

Then add the three functions to `module.exports`:

```js
module.exports = { levelFor, xpForDefeat, xpToReach, TITLE_BANDS, BADGES, deriveStats, evaluateBadges, nameKeyFor, QUEST_DEFS, dayStr, bumpActivity, evaluateQuests };
```

- [ ] **Step 4: Run the tests — verify they pass**

Run: `node --test test/progression.test.js`
Expected: PASS (all subtests ok).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add core/progression.js test/progression.test.js
git commit -m "feat(progression): quest engine — bumpActivity + evaluateQuests"
```

---

### Task 3: Wire quests into defeat + the per-turn tick, emit `quest_done`

**Files:**
- Modify: `core/boss.js:104-134` (`recordDefeat`)
- Modify: `core/defeat-flow.js`
- Modify: `scripts/hook-stop.js`
- Test: `test/progression.test.js` (defeat-flow text helpers — pure, no IO)

> Why two evaluation sites: `weekly_kills` only changes when a milestone is
> pushed, so it is evaluated inside `recordDefeat`. `streak_days` only changes
> on a new active day, so it is evaluated in the per-turn activity tick in
> `hook-stop`. Both call the same idempotent `evaluateQuests`; the `doneAt`
> guard makes the overlap harmless.

- [ ] **Step 1: Evaluate quests inside `recordDefeat`**

In `core/boss.js`, inside `recordDefeat`, the block currently reads:

```js
  // badges: evaluate against the now-updated profile, persist new ones
  prof.badges = prof.badges || [];
  const newBadges = prog.evaluateBadges(prof);
  const now = Date.now();
  for (const id of newBadges) prof.badges.push({ id, unlockedAt: now });
  state.writeProfile(prof);
  clear(cwd);
  return { total: prof.milestones.length, level: lv.level, leveledUp: lv.level > fromLevel, titleKey: lv.titleKey, newBadges };
```

Replace it with:

```js
  // badges: evaluate against the now-updated profile, persist new ones
  prof.badges = prof.badges || [];
  const newBadges = prog.evaluateBadges(prof);
  const now = Date.now();
  for (const id of newBadges) prof.badges.push({ id, unlockedAt: now });
  // quests: a fresh kill can complete weekly_kills (idempotent; streak handled per-turn)
  const { completed: newQuests } = prog.evaluateQuests(prof, now);
  state.writeProfile(prof);
  clear(cwd);
  return { total: prof.milestones.length, level: lv.level, leveledUp: lv.level > fromLevel, titleKey: lv.titleKey, newBadges, newQuests };
```

Also extend the `recordDefeat` JSDoc `@returns` (line ~109) to include the new field:

```js
 *  @returns {{ total: number, level: number, leveledUp: boolean, titleKey: string, newBadges: string[], newQuests: string[] }} */
```

- [ ] **Step 2: Add quest text + emit helpers to `core/defeat-flow.js`**

In `core/defeat-flow.js`, add a `questText` helper after `badgeText`:

```js
/** @param {string} qid quest kind/id @param {string} lang @returns {string} */
function questText(qid, lang) {
  const def = progression.QUEST_DEFS.find((d) => d.kind === qid);
  return locale.fmt(locale.t('quest.done', lang), { name: locale.t(def ? def.nameKey : qid, lang) });
}
```

Extend `rewardLines` to append quest lines after badges — replace the existing
function body's loop tail so it reads:

```js
function rewardLines(r, lang) {
  const out = [];
  if (r && r.leveledUp) out.push(levelupText(r, lang));
  for (const bid of (r && r.newBadges) || []) out.push(badgeText(bid, lang));
  for (const qid of (r && r.newQuests) || []) out.push(questText(qid, lang));
  return out;
}
```

Extend `emitRewards` to also emit quest completions from the result, and add a
standalone `emitQuests` for the per-turn path. Replace the `emitRewards`
function and `module.exports` with:

```js
function emitRewards(sid, r, lang) {
  if (!sid || !r) return;
  if (r.leveledUp) {
    state.appendEvent(sid, { t: Date.now(), kind: 'level_up', text: levelupText(r, lang) });
  }
  for (const bid of (r.newBadges || [])) {
    state.appendEvent(sid, { t: Date.now(), kind: 'badge_unlocked', badge: bid, text: badgeText(bid, lang) });
  }
  emitQuests(sid, r.newQuests || [], lang);
}

/** Emit one `quest_done` event per completed quest id. Shared by the defeat
 *  path (via emitRewards) and the per-turn activity tick in hook-stop.
 *  @param {string} sid @param {string[]} ids @param {string} lang @returns {void} */
function emitQuests(sid, ids, lang) {
  if (!sid) return;
  for (const qid of (ids || [])) {
    state.appendEvent(sid, { t: Date.now(), kind: 'quest_done', quest: qid, text: questText(qid, lang) });
  }
}

module.exports = { emitRewards, rewardLines, emitQuests };
```

- [ ] **Step 3: Run the activity tick in `scripts/hook-stop.js`**

In `scripts/hook-stop.js`, the totals block currently reads:

```js
    const prof = state.readProfile();
    prof.totals.turns += 1;
    prof.totals.dmg += agg.dmg;
    prof.totals.kills += agg.kills;
    state.writeProfile(prof);
```

Replace it with:

```js
    const prof = state.readProfile();
    prof.totals.turns += 1;
    prof.totals.dmg += agg.dmg;
    prof.totals.kills += agg.kills;
    // per-turn activity tick: advance the daily streak, refresh quest progress
    const progression = require('../core/progression');
    const tickNow = Date.now();
    progression.bumpActivity(prof, tickNow);
    const { completed: doneQuests } = progression.evaluateQuests(prof, tickNow);
    state.writeProfile(prof);
    defeatFlow.emitQuests(id, doneQuests, lang);
```

> Ordering note: `recordDefeat` (run earlier in this hook for an auto-down kill)
> already persisted its quest evaluation; this `readProfile()` re-reads that
> updated profile, so there is no clobber — the tick layers streak + quest
> refresh on top of the same single source.

- [ ] **Step 4: Write the failing tests for the text helpers**

Append to `test/progression.test.js` (these exercise `defeat-flow` pure helpers; they need a SLIME_ROOT tmpdir set **before** requiring, matching the repo's test-isolation rule):

```js
const { test: t2 } = require('node:test');
```

Actually reuse the existing `test`/`assert`/`prog` already required at the top of the file, and the existing `SLIME_ROOT` setup if present. Add:

```js
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
```

> If `test/progression.test.js` does not already set `process.env.SLIME_ROOT`,
> add at the very top of the file (before any `require` of core modules):
> ```js
> const os = require('node:os');
> const path = require('node:path');
> process.env.SLIME_ROOT = path.join(os.tmpdir(), 'slime-prog-test');
> ```
> `defeat-flow` pulls in `core/state`, which captures `SLIME_ROOT` at require
> time — set it first so the test never touches the real profile.

- [ ] **Step 5: Run the new tests — verify they pass**

Run: `node --test test/progression.test.js`
Expected: PASS.

- [ ] **Step 6: Run the full suite + typecheck**

Run: `node --test test/` then `npm run typecheck`
Expected: all pass; no type errors. (Confirms `recordDefeat` callers in
`scripts/defeat.js`, `scripts/hook-stop.js`, `scripts/hook-posttool.js` still
typecheck with the widened return shape — `newQuests` is additive.)

- [ ] **Step 7: Commit**

```bash
git add core/boss.js core/defeat-flow.js scripts/hook-stop.js test/progression.test.js
git commit -m "feat(progression): wire quests into defeat + per-turn tick, emit quest_done"
```

---

### Task 4: Render the quest section in `/slime:achievements`

**Files:**
- Modify: `scripts/achievements.js`
- Test: `test/achievements.test.js`

- [ ] **Step 1: Write the failing test**

Append to `test/achievements.test.js` (follow the file's existing `render`
import + profile-shape pattern):

```js
test('render: shows both quests with progress/target, defaulting to 0 when unseeded', () => {
  const ach = require('../scripts/achievements');
  const out = ach.render({ xp: 0, badges: [], milestones: [] }, 'en');
  assert.match(out, /Quests/);
  assert.match(out, /Weekly Hunter\s+0\/5/);
  assert.match(out, /Daily Grind\s+0\/7/);
});

test('render: reflects an active quest instance progress/target', () => {
  const ach = require('../scripts/achievements');
  const profile = {
    xp: 0, badges: [], milestones: [],
    quests: [{ id: 'weekly_kills', kind: 'weekly_kills', target: 5, progress: 3, startedAt: 1 }],
  };
  const out = ach.render(profile, 'en');
  assert.match(out, /Weekly Hunter\s+3\/5/);
});
```

- [ ] **Step 2: Run the test — verify it fails**

Run: `node --test test/achievements.test.js`
Expected: FAIL — no "Quests" section in the output.

- [ ] **Step 3: Render the quest section**

In `scripts/achievements.js`, the `render` function currently ends its body with
the badge loop, then `return lines.join('\n');`. Insert the quest block
**before** that `return`:

```js
  lines.push('');
  lines.push(locale.t('ach.questsHeader', lang));
  for (const def of prog.QUEST_DEFS) {
    const q = (profile.quests || []).find((x) => x.kind === def.kind && !x.doneAt);
    lines.push(locale.fmt(locale.t('ach.questLine', lang), {
      name: locale.t(def.nameKey, lang),
      progress: q ? q.progress : 0,
      target: q ? q.target : def.target,
    }));
  }
  return lines.join('\n');
```

- [ ] **Step 4: Run the test — verify it passes**

Run: `node --test test/achievements.test.js`
Expected: PASS.

- [ ] **Step 5: Eyeball the rendered screen**

Run: `node scripts/achievements.js`
Expected: the existing level + badge grid, followed by a `Quests` header and two
lines like `🎯 Weekly Hunter  0/5` and `🎯 Daily Grind  0/7`.

- [ ] **Step 6: Full suite + typecheck**

Run: `node --test test/` then `npm run typecheck`
Expected: all pass; no type errors.

- [ ] **Step 7: Commit**

```bash
git add scripts/achievements.js test/achievements.test.js
git commit -m "feat(progression): show active quests on the achievements screen"
```

---

### Task 5: Arena reacts to `quest_done`

**Files:**
- Modify: `public/arena.js:1308`

> `public/arena.js` is excluded from `tsc` (browser globals + vendored PIXI) and
> has no node unit test; this is a one-line, governor-respecting reuse of the
> existing `levelup` cutscene, verified by eyeball.

- [ ] **Step 1: Map `quest_done` to the levelup cutscene**

In `public/arena.js`, the event switch currently has:

```js
      case 'level_up': case 'badge_unlocked': A.play('levelup'); break;
```

Replace with:

```js
      case 'level_up': case 'badge_unlocked': case 'quest_done': A.play('levelup'); break;
```

- [ ] **Step 2: Eyeball the arena**

Run:

```bash
SLIME_ROOT=/tmp/slime-demo node scripts/demo-feed.js &
SLIME_ROOT=/tmp/slime-demo SLIME_PORT=4118 node scripts/serve.js
```

Then in another shell append a synthetic event and confirm the arena plays the
levelup cutscene (flashes stay ≤3/sec; `?calm=1` degrades it):

```bash
echo '{"t":0,"kind":"quest_done","quest":"weekly_kills","text":"🎯 Quest complete — Weekly Hunter"}' >> /tmp/slime-demo/sessions/*.jsonl
```

Open `http://127.0.0.1:4118`. Expected: a levelup-style cutscene fires. Stop the
two background processes when done.

- [ ] **Step 3: Commit**

```bash
git add public/arena.js
git commit -m "feat(arena): quest_done plays the levelup cutscene"
```

---

## Self-Review

**1. Spec coverage** (Phase 4 line in the design spec: "Auto weekly-kills + streak-days; `applyTurnEnd`/`applyDefeat` refresh progress, emit `quest_done`, roll the next; progress shown in `/slime:achievements` and (compact) statusline"):
- Auto weekly-kills + streak-days → Task 2 `QUEST_DEFS` + `evaluateQuests`. ✓
- Refresh on defeat → Task 3 Step 1 (`recordDefeat`). ✓
- Refresh on turn-end (the spec's `applyTurnEnd`) → Task 3 Step 3 (`hook-stop` tick = `bumpActivity` + `evaluateQuests`). The codebase never grew literal `applyDefeat`/`applyTurnEnd` orchestrators (Phase 2/3 inlined the same logic into `recordDefeat` + `hook-stop`); this plan follows that established shape rather than the spec's illustrative signatures. ✓ (intentional deviation, noted)
- Emit `quest_done` → Task 3 Step 2 (`emitQuests`). ✓
- Roll the next → Task 2 `evaluateQuests` (window reset / target escalation). ✓
- Shown in `/slime:achievements` → Task 4. ✓
- Arena reaction (Phase 2/3 gave `level_up`/`badge_unlocked` cutscenes; parity) → Task 5. ✓
- **(compact) statusline — DEFERRED.** The spec parenthesizes it as the lower-priority surface. Adding it cleanly requires threading a quest hint through `hud.render`'s positional signature (`render(snap, stdinJson, tips, now, usageCache, lang, live, level)`) plus the `scripts/statusline.js` caller and new `hud` tests — a self-contained change worth its own small follow-up rather than bloating this plan. The feature ships working without it: quests live, persist, complete, emit events, and surface in `/achievements` + the arena. Tracked as Phase 4b.

**2. Placeholder scan:** every code step shows complete code; commands have expected output. Task 3 Step 4 calls out the `SLIME_ROOT`-before-require isolation rule explicitly. No TBD/TODO. ✓

**3. Type consistency:** `Quest` fields (`id/kind/target/progress/startedAt/doneAt`) match across `types.d.ts` (Task 1), the engine (Task 2), and the renderer (Task 4). `recordDefeat` returns `newQuests: string[]`; `rewardLines`/`emitRewards` consume `r.newQuests`; `emitQuests(sid, ids, lang)` and `evaluateQuests(profile, now) → {quests, completed}` signatures are used consistently everywhere they appear. Event kind is `quest_done` (field `quest`) in both `defeat-flow` and the arena switch. ✓

---

## Execution Handoff

Implement task-by-task with the REQUIRED SUB-SKILL. Each task ends green
(`node --test test/` + `npm run typecheck`) and is its own commit. Tasks are
ordered so each builds on the last: types/locale → engine → wiring → surfacing → arena.
