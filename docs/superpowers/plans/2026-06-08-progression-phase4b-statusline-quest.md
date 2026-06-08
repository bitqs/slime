# Progression Phase 4b — Statusline Quest Meter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the active quest closest to completion as a compact `🎯{progress}/{target}` badge in the statusline, right after the `✦Lv` badge.

**Architecture:** A pure `progression.nearestQuest(profile)` selector picks the active quest with the highest progress/target ratio. `scripts/statusline.js` formats it as `"p/t"` and passes it through a new optional `quest` param on `hud.render`, which renders ` 🎯{quest}` (sanitized) after the level badge in both the in-turn and between-turns lines. The deferred Phase 4b surface from the Phase 4 quests work.

**Tech Stack:** Node ≥20 builtin `node:test`/`assert`; JSDoc + `tsc --checkJs` strict. No new deps.

---

## File Structure

- Modify `core/progression.js` — add pure `nearestQuest(profile) → Quest | null` + export.
- Modify `core/hud.js` — add an optional `quest` param to `render`, rendered as a sanitized `🎯` badge after `✦Lv` in both output paths.
- Modify `scripts/statusline.js` — read the full profile once, compute the nearest quest, pass the formatted hint to `render`.
- Tests: `test/progression.test.js` (nearestQuest), `test/hud.test.js` (badge rendering).

**Display rule (locked):** the *active* (no `doneAt`) quest with the highest `progress/target` ratio. Ties → first in array order (stable). No active quest → no badge. Statusline-safety: the badge string passes through `hud.sanitize` like every other terminal-rendered field.

---

### Task 1: `progression.nearestQuest` selector

**Files:**
- Modify: `core/progression.js`
- Test: `test/progression.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/progression.test.js`:

```js
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
```

- [ ] **Step 2: Run — verify FAIL**

Run: `node --test test/progression.test.js`
Expected: FAIL — `prog.nearestQuest is not a function`.

- [ ] **Step 3: Implement `nearestQuest`**

In `core/progression.js`, add after `evaluateQuests` (before `module.exports`):

```js
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
```

Add `nearestQuest` to `module.exports`:

```js
module.exports = { levelFor, xpForDefeat, xpToReach, TITLE_BANDS, BADGES, deriveStats, evaluateBadges, nameKeyFor, QUEST_DEFS, dayStr, bumpActivity, evaluateQuests, nearestQuest };
```

- [ ] **Step 4: Run — verify PASS**

Run: `node --test test/progression.test.js`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add core/progression.js test/progression.test.js
git commit -m "feat(progression): nearestQuest selector for the statusline meter"
```

---

### Task 2: Render the quest badge + wire the statusline

**Files:**
- Modify: `core/hud.js`
- Modify: `scripts/statusline.js`
- Test: `test/hud.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/hud.test.js`:

```js
test('quest badge renders after the Lv badge in-turn', () => {
  const now = Date.now();
  const line = hud.render(
    { inTurn: true, combo: 2, kills: 1, dmg: 10, summons: 0,
      boss: { name: 'B', hp: 50 }, lastText: 'x', updated: now },
    {}, TIPS, now, null, 'en', null, 4, '3/5'
  );
  assert.match(line, /✦Lv4 🎯3\/5/);
});

test('quest badge renders between turns', () => {
  const now = Date.now();
  const snap = { inTurn: false, updated: now - 60000, lastText: '🏆 done' };
  const line = hud.render(snap, {}, TIPS, now, null, 'en', null, 4, '3/5');
  assert.match(line, /✦Lv4 🎯3\/5/);
});

test('no quest badge when the quest arg is omitted', () => {
  const now = Date.now();
  const snap = { inTurn: false, updated: now - 60000, lastText: '🏆 done' };
  const line = hud.render(snap, {}, TIPS, now, null, 'en', null, 4);
  assert.doesNotMatch(line, /🎯/);
});
```

- [ ] **Step 2: Run — verify FAIL**

Run: `node --test test/hud.test.js`
Expected: FAIL — no `🎯` badge in the rendered lines.

- [ ] **Step 3: Add the `quest` param to `hud.render`**

In `core/hud.js`, update the JSDoc above `render` to add the new param (after the
`@param {number} [level]` line):

```js
 * @param {string} [quest] nearest quest "progress/target" → shown as a 🎯 badge
```

Change the signature:

```js
function render(snap, stdinJson, tips, now, usageCache, lang, live, level, quest) {
```

Just after the existing `const lv = level ? \` ✦Lv${level}\` : '';` line, add:

```js
  const q = quest ? ` 🎯${sanitize(quest, 12)}` : '';
```

Then render `${q}` immediately after `${lv}` in BOTH lead lines. The between-turns
return:

```js
    return `🟢${uiLink(live)}${lv}${q}${mSuffix} ${body}`;
```

and the in-turn lead push:

```js
  parts.push(`🟢${uiLink(live)}${lv}${q}${mSuffix}`);
```

(`sanitize` is already defined and used in this file. The numeric `p/t` string
can't carry control chars, but sanitizing honors the statusline-safety rule that
*everything* terminal-rendered passes through `hud.sanitize`.)

- [ ] **Step 4: Run — verify PASS**

Run: `node --test test/hud.test.js`
Expected: PASS.

- [ ] **Step 5: Wire `scripts/statusline.js`**

In `scripts/statusline.js`, the current two lines:

```js
  const level = state.readProfile().level;
  process.stdout.write(hud.render(snap, stdin, tips, Date.now(), usage.readCache(), lang, arenaStatus.readLive(), level));
```

become:

```js
  const prof = state.readProfile();
  const nq = require('../core/progression').nearestQuest(prof);
  const quest = nq ? `${nq.progress}/${nq.target}` : undefined;
  process.stdout.write(hud.render(snap, stdin, tips, Date.now(), usage.readCache(), lang, arenaStatus.readLive(), prof.level, quest));
```

- [ ] **Step 6: Full suite + typecheck**

Run: `node --test test/` then `npm run typecheck`
Expected: all pass; no type errors.

- [ ] **Step 7: Eyeball the statusline**

Run:

```bash
node -e '
const os=require("os"),path=require("path");
process.env.SLIME_ROOT=path.join(os.tmpdir(),"slime-sl-"+process.pid);
const state=require("./core/state"); state.ensureDirs();
const prof=state.readProfile();
prof.level=4;
prof.quests=[{id:"weekly_kills",kind:"weekly_kills",target:5,progress:3,startedAt:1},{id:"streak_days",kind:"streak_days",target:7,progress:1,startedAt:1}];
state.writeProfile(prof);
const hud=require("./core/hud"); const prog=require("./core/progression");
const nq=prog.nearestQuest(prof);
console.log(hud.render({inTurn:false,updated:Date.now(),lastText:"ready"},{},[],Date.now(),null,"en",null,prof.level,nq?`${nq.progress}/${nq.target}`:undefined));
require("fs").rmSync(process.env.SLIME_ROOT,{recursive:true,force:true});
'
```

Expected: a line containing `✦Lv4 🎯3/5`.

- [ ] **Step 8: Commit**

```bash
git add core/hud.js scripts/statusline.js test/hud.test.js
git commit -m "feat(hud): compact nearest-quest badge in the statusline"
```

---

## Self-Review

**1. Spec coverage:** nearest-to-done quest selection → Task 1 `nearestQuest`; compact `🎯p/t` after `✦Lv` → Task 2 render; statusline wiring → Task 2 Step 5. ✓

**2. Placeholder scan:** every code step is complete; the only non-code step (eyeball) has a concrete command + expected output. No TBD/TODO. ✓

**3. Type consistency:** `nearestQuest(profile) → Quest | null` returns a `Quest` whose `.progress`/`.target` are read in `statusline.js` and formatted to the `"p/t"` string passed as `render`'s `quest` param; `render` renders it via `sanitize`. The `Quest` type already exists (Phase 4). The `render` arg order — `(…, live, level, quest)` — matches the call site in `statusline.js`. Consistent. ✓

---

## Execution Handoff

Two tasks, TDD, each its own commit: selector → render+wiring. Each ends green
(`node --test test/` + `npm run typecheck`).
