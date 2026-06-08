# Progression Phase 3 — Badges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add unlockable badges — declarative achievement criteria in `data/badges.json`, a pure `evaluateBadges` engine function, badge capture on every confirmed kill (emitting a `badge_unlocked` event), and a new `/slime:achievements` command showing level, title, and the badge grid (owned vs locked).

**Architecture:** Badges are declarative `{id, nameKey, stat, gte}` rows in `data/badges.json` — adding one is a JSON line + two locale keys, no code change (the Vibe-Coding seam). `core/progression.js` gains a pure `deriveStats(profile)` + `evaluateBadges(profile)` (returns newly-satisfied ids, excluding owned). `boss.recordDefeat` evaluates badges after awarding XP, persists them with `unlockedAt`, and returns `newBadges` so its two callers (`hook-stop.js` auto-down, `defeat.js` manual) append a display-only `badge_unlocked` event each. A new `scripts/achievements.js` renders level + badge grid; `commands/achievements.md` exposes it. This is Phase 3 of `docs/superpowers/specs/2026-06-08-progression-achievements-design.md`.

**Scope note (deviation from spec):** the spec lists an arena `badge_unlocked` cutscene under Phase 3. Arena FX has no unit tests (browser-only, PIXI closure) and the Phase 2 `level_up` arena handler was never wired either. To keep Phase 3 fully testable and shippable, the arena reward cutscenes (`level_up` + `badge_unlocked`) are deferred to a separate "arena reward FX" plan that wires both at once. The `badge_unlocked` **events** are emitted here, so the arena work is purely additive later.

**Tech Stack:** Node 20, CommonJS, `node:test`, `tsc --checkJs` strict, zero deps. Engine in `core/`, entry scripts in `scripts/`, declarative data in `data/`, i18n in `data/locales/{en,zh}.json`.

---

## File Structure

- `data/badges.json` — **Create.** The six declarative badge rows (Task 1).
- `data/locales/en.json`, `data/locales/zh.json` — **Modify.** Badge name keys + `badge.unlocked` template + achievements UI labels (Task 1).
- `test/locale-badges.test.js` — **Create.** Asserts every badge `nameKey` resolves in both catalogs (Task 1).
- `core/types.d.ts` — **Modify.** Add a `BadgeDef` interface (Task 2).
- `core/progression.js` — **Modify.** Add `deriveStats`, `evaluateBadges`, export loaded `BADGES` + `nameKeyFor` (Task 2).
- `test/progression.test.js` — **Modify.** Add badge-engine tests (Task 2).
- `core/boss.js` — **Modify.** `recordDefeat` evaluates + persists badges, returns `newBadges` (Task 3).
- `test/boss.test.js` — **Modify.** Tests for badge capture + idempotency (Task 3).
- `scripts/hook-stop.js`, `scripts/defeat.js` — **Modify.** Emit `badge_unlocked` events (Task 3).
- `scripts/achievements.js` — **Create.** Renderer + CLI for `/achievements` (Task 4).
- `commands/achievements.md` — **Create.** Slash command wrapping the script (Task 4).
- `test/achievements.test.js` — **Create.** Renderer test (Task 4).

---

### Task 1: Declarative badge data + locale keys

**Files:**
- Create: `data/badges.json`
- Modify: `data/locales/en.json`, `data/locales/zh.json`
- Test: `test/locale-badges.test.js`

- [ ] **Step 1: Create `data/badges.json`**

Create `data/badges.json` with exactly:
```json
[
  { "id": "first-blood", "nameKey": "badge.firstBlood", "stat": "bossCount",  "gte": 1 },
  { "id": "combo-king",  "nameKey": "badge.comboKing",  "stat": "maxCombo",   "gte": 10 },
  { "id": "slayer",      "nameKey": "badge.slayer",     "stat": "kills",      "gte": 50 },
  { "id": "polyglot",    "nameKey": "badge.polyglot",   "stat": "projects",   "gte": 3 },
  { "id": "night-owl",   "nameKey": "badge.nightOwl",   "stat": "nightKills", "gte": 1 },
  { "id": "veteran",     "nameKey": "badge.veteran",    "stat": "bossCount",  "gte": 25 }
]
```

- [ ] **Step 2: Add English locale keys**

In `data/locales/en.json`, add these keys (place them after the existing `title.grandmaster` line; remember JSON comma hygiene):
```json
  "badge.unlocked": "🏅 Badge unlocked — {name}",
  "badge.firstBlood": "First Blood",
  "badge.comboKing": "Combo King",
  "badge.slayer": "Slayer",
  "badge.polyglot": "Polyglot",
  "badge.nightOwl": "Night Owl",
  "badge.veteran": "Veteran",
  "ach.title": "🏅  ACHIEVEMENTS",
  "ach.level": "Lv{level} {title}  ({into}/{span} XP)",
  "ach.badgesHeader": "Badges ({owned}/{total})",
  "ach.locked": "locked"
```

- [ ] **Step 3: Add Chinese locale keys**

In `data/locales/zh.json`, add the parallel keys (after its `title.grandmaster` line):
```json
  "badge.unlocked": "🏅 解锁徽章 — {name}",
  "badge.firstBlood": "首杀",
  "badge.comboKing": "连击之王",
  "badge.slayer": "屠戮者",
  "badge.polyglot": "多面手",
  "badge.nightOwl": "夜枭",
  "badge.veteran": "老兵",
  "ach.title": "🏅  成就",
  "ach.level": "Lv{level} {title}  ({into}/{span} 经验)",
  "ach.badgesHeader": "徽章 ({owned}/{total})",
  "ach.locked": "未解锁"
```

- [ ] **Step 4: Write the locale-completeness test**

Create `test/locale-badges.test.js`:
```js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const badges = require('../data/badges.json');
const read = (lang) => JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'data', 'locales', `${lang}.json`), 'utf8'));

test('badges.json: ids unique, shape valid', () => {
  const ids = badges.map((b) => b.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate badge id');
  for (const b of badges) {
    assert.ok(b.id && b.nameKey && b.stat, `badge missing field: ${JSON.stringify(b)}`);
    assert.equal(typeof b.gte, 'number');
  }
});

test('every badge nameKey resolves in en and zh', () => {
  const en = read('en');
  const zh = read('zh');
  for (const b of badges) {
    assert.ok(en[b.nameKey], `en missing ${b.nameKey}`);
    assert.ok(zh[b.nameKey], `zh missing ${b.nameKey}`);
  }
});

test('badge.unlocked + ach.* keys exist in both catalogs', () => {
  const en = read('en');
  const zh = read('zh');
  for (const k of ['badge.unlocked', 'ach.title', 'ach.level', 'ach.badgesHeader', 'ach.locked']) {
    assert.ok(en[k], `en missing ${k}`);
    assert.ok(zh[k], `zh missing ${k}`);
  }
});
```

- [ ] **Step 5: Run the test — verify it passes**

Run: `node --test test/locale-badges.test.js 2>&1 | grep -E '# (tests|pass|fail)'`
Expected: `# fail 0`. (If a key is missing, fix the locale JSON.)

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: banner only, no diagnostics.

- [ ] **Step 7: Commit**

```bash
git add data/badges.json data/locales/en.json data/locales/zh.json test/locale-badges.test.js
git commit -m "feat(progression): declarative badge data + locale keys

Six badges as {id,nameKey,stat,gte} rows in data/badges.json (the add-a-badge
seam). Badge names, the unlocked template, and achievements UI labels added to
both locales. Test asserts every nameKey resolves. Phase 3 of the progression spec.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Badge engine — `deriveStats` + `evaluateBadges`

**Files:**
- Modify: `core/types.d.ts` (add `BadgeDef`)
- Modify: `core/progression.js`
- Test: `test/progression.test.js`

- [ ] **Step 1: Add the `BadgeDef` type**

In `core/types.d.ts`, add this interface immediately after the `Profile` interface (after its closing `}`):
```ts
export interface BadgeDef {
  id: string;
  nameKey: string;
  stat: 'bossCount' | 'maxCombo' | 'kills' | 'projects' | 'nightKills' | 'badgeCount';
  gte: number;
}
```

- [ ] **Step 2: Write the failing tests**

Append to `test/progression.test.js`:
```js
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
```

- [ ] **Step 3: Run the new tests — verify they fail**

Run: `node --test test/progression.test.js 2>&1 | grep -E 'deriveStats|evaluateBadges|nameKeyFor|# (pass|fail)'`
Expected: the five new tests FAIL (`prog.deriveStats`/`evaluateBadges`/`nameKeyFor` are not functions).

- [ ] **Step 4: Implement the engine**

In `core/progression.js`, add after the `xpForDefeat` function (before `module.exports`):
```js
/** @typedef {import('./types').Profile} Profile */
/** @typedef {import('./types').BadgeDef} BadgeDef */

/** Declarative badge criteria — the add-a-badge seam (data/badges.json). */
/** @type {BadgeDef[]} */
const BADGES = require('../data/badges.json');

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
```

Then extend the exports line:
```js
module.exports = { levelFor, xpForDefeat, xpToReach, TITLE_BANDS, BADGES, deriveStats, evaluateBadges, nameKeyFor };
```

- [ ] **Step 5: Run tests — verify they pass**

Run: `node --test test/progression.test.js 2>&1 | grep -E '# (tests|pass|fail)'`
Expected: all pass, `# fail 0`.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: banner only, no diagnostics.

- [ ] **Step 7: Commit**

```bash
git add core/types.d.ts core/progression.js test/progression.test.js
git commit -m "feat(progression): badge engine — deriveStats + evaluateBadges

Pure, deterministic: deriveStats flattens the profile into the stats every
badge predicate checks; evaluateBadges returns newly-satisfied ids (owned
excluded). Criteria load from data/badges.json; nameKeyFor maps id→locale key.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Capture badges on defeat + emit `badge_unlocked`

**Files:**
- Modify: `core/boss.js` (`recordDefeat`)
- Modify: `scripts/hook-stop.js`, `scripts/defeat.js`
- Test: `test/boss.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/boss.test.js`:
```js
const prog = require('../core/progression');

test('recordDefeat: unlocks first-blood on the first kill and returns it', () => {
  const b = boss.loadOrCreate('/p/badge1', 'do work');
  const r = boss.recordDefeat('/p/badge1', b, { dmg: 5, kills: 1, maxCombo: 2 });
  assert.ok(Array.isArray(r.newBadges));
  assert.ok(r.newBadges.includes('first-blood'));
  const prof = state.readProfile();
  assert.ok((prof.badges || []).some((x) => x.id === 'first-blood'));
  assert.ok(prof.badges.find((x) => x.id === 'first-blood').unlockedAt > 0);
});

test('recordDefeat: badge unlock is idempotent — not re-awarded next kill', () => {
  const b1 = boss.loadOrCreate('/p/badge2', 'do work');
  boss.recordDefeat('/p/badge2', b1, { dmg: 1, kills: 0, maxCombo: 0 });
  const b2 = boss.loadOrCreate('/p/badge2', 'more work');
  const r2 = boss.recordDefeat('/p/badge2', b2, { dmg: 1, kills: 0, maxCombo: 0 });
  assert.ok(!r2.newBadges.includes('first-blood'), 'first-blood re-awarded');
  const prof = state.readProfile();
  assert.equal(prof.badges.filter((x) => x.id === 'first-blood').length, 1);
});

test('recordDefeat: combo-king unlocks when maxCombo ≥ 10', () => {
  const b = boss.loadOrCreate('/p/badge3', 'do work');
  const r = boss.recordDefeat('/p/badge3', b, { dmg: 0, kills: 0, maxCombo: 10 });
  assert.ok(r.newBadges.includes('combo-king'));
});
```
(`test/boss.test.js` already requires `boss` and `state` and sets `SLIME_ROOT` at the top; only `prog` is new.)

- [ ] **Step 2: Run the new tests — verify they fail**

Run: `node --test test/boss.test.js 2>&1 | grep -E 'first-blood|combo-king|idempotent|# (pass|fail)'`
Expected: the three new tests FAIL (`recordDefeat` returns no `newBadges`, writes no `prof.badges`).

- [ ] **Step 3: Implement badge capture in `recordDefeat`**

In `core/boss.js`, replace the whole `recordDefeat` function with:
```js
/** Push a milestone, award XP, recompute level, unlock any newly-earned badges,
 *  and clear the boss file.
 *  @param {string} cwd @param {BossState} b
 *  @param {{ dmg?: number; kills?: number; maxCombo?: number }} [stats]
 *  @returns {{ total: number, level: number, leveledUp: boolean, titleKey: string, newBadges: string[] }} */
function recordDefeat(cwd, b, stats = {}) {
  const prof = state.readProfile();
  const m = {
    boss: b.name, date: new Date().toISOString().slice(0, 10),
    turns: b.turns || 0, project: cwd,
    at: Date.now(),
    dmg: typeof stats.dmg === 'number' ? stats.dmg : (b.dmgTaken || 0),
    kills: stats.kills || 0,
    maxCombo: stats.maxCombo || 0,
  };
  prof.milestones.push(m);
  const prog = require('./progression');
  const fromLevel = prog.levelFor(prof.xp || 0).level;
  prof.xp = (prof.xp || 0) + prog.xpForDefeat(m);
  const lv = prog.levelFor(prof.xp);
  prof.level = lv.level;
  // badges: evaluate against the now-updated profile, persist new ones
  prof.badges = prof.badges || [];
  const newBadges = prog.evaluateBadges(prof);
  const now = Date.now();
  for (const id of newBadges) prof.badges.push({ id, unlockedAt: now });
  state.writeProfile(prof);
  clear(cwd);
  return { total: prof.milestones.length, level: lv.level, leveledUp: lv.level > fromLevel, titleKey: lv.titleKey, newBadges };
}
```

- [ ] **Step 4: Run tests — verify they pass**

Run: `node --test test/boss.test.js 2>&1 | grep -E '# (tests|pass|fail)'`
Expected: all pass, `# fail 0`.

- [ ] **Step 5: Emit `badge_unlocked` in `hook-stop.js`**

In `scripts/hook-stop.js`, inside the `if (b.broken)` branch, immediately after the existing `if (r.leveledUp) { … }` block, add:
```js
        for (const id of r.newBadges) {
          state.appendEvent(id, { t: Date.now(), kind: 'badge_unlocked', badge: id,
            text: locale.fmt(locale.t('badge.unlocked', lang), { name: locale.t(require('../core/progression').nameKeyFor(id) || id, lang) }) });
        }
```
**Naming caution:** the loop variable here MUST NOT be `id` — that name is already the session id in this scope (`const id = p.session_id;`). Rename the loop variable to `bid` and use it for both the event id arg position and the badge field:
```js
        for (const bid of r.newBadges) {
          state.appendEvent(id, { t: Date.now(), kind: 'badge_unlocked', badge: bid,
            text: locale.fmt(locale.t('badge.unlocked', lang), { name: locale.t(require('../core/progression').nameKeyFor(bid) || bid, lang) }) });
        }
```
(Use this second version. `state.appendEvent(id, …)` appends to the current session; `badge: bid` records which badge.)

- [ ] **Step 6: Emit `badge_unlocked` in `defeat.js`**

In `scripts/defeat.js`, inside `if (sid) { … }`, after the existing `if (levelUp) { … }` line, add:
```js
    for (const bid of r.newBadges) {
      state.appendEvent(sid, { t: Date.now(), kind: 'badge_unlocked', badge: bid,
        text: locale.fmt(locale.t('badge.unlocked', lang), { name: locale.t(require('../core/progression').nameKeyFor(bid) || bid, lang) }) });
    }
```
Also surface it in the console output: after the `if (levelUp) out.push(levelUp);` line, add:
```js
  for (const bid of r.newBadges) {
    out.push(locale.fmt(locale.t('badge.unlocked', lang), { name: locale.t(require('../core/progression').nameKeyFor(bid) || bid, lang) }));
  }
```
(`locale` and `lang` are already in scope in `defeat.js`.)

- [ ] **Step 7: Run the full suite + typecheck**

Run:
```bash
node --test test/ 2>&1 | grep -E '^# (tests|pass|fail)'
npm run typecheck
```
Expected: `# fail 0`; typecheck banner only.

- [ ] **Step 8: Smoke-test the manual defeat path**

Run (seed a boss + session in a throwaway root, then kill it):
```bash
R=$(mktemp -d)
SLIME_ROOT="$R" node -e "
  const boss=require('./core/boss'); const state=require('./core/state');
  state.ensureDirs();
  const b=boss.loadOrCreate('/p/smoke','build a thing'); boss.save('/p/smoke',b);
  state.appendEvent('s1',{t:Date.now(),kind:'resolve',dmg:5,combo:1});
"
SLIME_ROOT="$R" node scripts/defeat.js /p/smoke
rm -rf "$R"
```
Expected: output includes `— DEFEATED`, `Recorded on the Milestone Wall`, and a `🏅 Badge unlocked — First Blood` line.

- [ ] **Step 9: Commit**

```bash
git add core/boss.js scripts/hook-stop.js scripts/defeat.js test/boss.test.js
git commit -m "feat(progression): unlock badges on defeat + emit badge_unlocked

recordDefeat evaluates badges against the updated profile, persists new ones
with unlockedAt, and returns newBadges. hook-stop (auto-down) and defeat.js
(manual) append a display-only badge_unlocked event per new badge; defeat also
prints it. Idempotent — a badge unlocks once.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `/slime:achievements` command — level + badge grid

**Files:**
- Create: `scripts/achievements.js`
- Create: `commands/achievements.md`
- Test: `test/achievements.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/achievements.test.js`:
```js
const { test } = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

process.env.SLIME_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'slime-ach-'));
const ach = require('../scripts/achievements');

test('render: shows level line and owned vs locked badges', () => {
  const profile = {
    milestones: [],
    totals: { turns: 0, dmg: 0, kills: 0 },
    gear: {},
    xp: 150,                                   // L2
    badges: [{ id: 'first-blood', unlockedAt: 1 }],
  };
  const out = ach.render(profile, 'en');
  assert.match(out, /Lv2/);                     // level shown
  assert.match(out, /First Blood/);             // owned badge name
  assert.match(out, /✅/);                       // owned marker
  assert.match(out, /🔒/);                       // at least one locked badge
  assert.match(out, /Combo King/);              // a locked badge still listed
});

test('render: empty profile is safe (Lv1, all locked)', () => {
  const out = ach.render({ milestones: [], totals: { turns: 0, dmg: 0, kills: 0 }, gear: {} }, 'en');
  assert.match(out, /Lv1/);
  assert.doesNotMatch(out, /✅/);                // nothing owned
});
```

- [ ] **Step 2: Run the test — verify it fails**

Run: `node --test test/achievements.test.js 2>&1 | grep -E 'render|# (pass|fail)'`
Expected: FAIL — `Cannot find module '../scripts/achievements'`.

- [ ] **Step 3: Implement `scripts/achievements.js`**

Create `scripts/achievements.js`:
```js
#!/usr/bin/env node
/** @typedef {import('../core/types').Profile} Profile */
const state = require('../core/state');
const locale = require('../core/locale');
const prog = require('../core/progression');

/** Render the achievements screen: level/title line + badge grid (owned vs locked).
 *  Pure given (profile, lang). @param {Profile} profile @param {string} lang @returns {string} */
function render(profile, lang) {
  const lv = prog.levelFor(profile.xp || 0);
  const owned = new Set((profile.badges || []).map((b) => b.id));
  const lines = [locale.t('ach.title', lang), ''];
  lines.push(locale.fmt(locale.t('ach.level', lang), {
    level: lv.level,
    title: locale.t(lv.titleKey, lang),
    into: lv.intoLevel,
    span: lv.span,
  }));
  lines.push('');
  lines.push(locale.fmt(locale.t('ach.badgesHeader', lang), { owned: owned.size, total: prog.BADGES.length }));
  for (const d of prog.BADGES) {
    const name = locale.t(d.nameKey, lang);
    if (owned.has(d.id)) lines.push(`  ✅ ${name}`);
    else lines.push(`  🔒 ${name}  (${locale.t('ach.locked', lang)})`);
  }
  return lines.join('\n');
}

module.exports = { render };

if (require.main === module) {
  try {
    const prof = state.readProfile();
    console.log(render(prof, locale.current()));
  } catch (e) {
    console.log('The hall of fame is sealed: ' + (e instanceof Error ? e.message : String(e)));
  }
  process.exit(0);
}
```

- [ ] **Step 4: Run the test — verify it passes**

Run: `node --test test/achievements.test.js 2>&1 | grep -E '# (tests|pass|fail)'`
Expected: all pass, `# fail 0`.

- [ ] **Step 5: Create the slash command**

Create `commands/achievements.md` (mirror the `commands/milestones.md` format exactly):
```markdown
---
description: Show your Achievements — level, title, and badge grid
allowed-tools: Bash
---

Run this command and show its full output to the user verbatim, nothing else:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/achievements.js"
```
```

- [ ] **Step 6: Eyeball the rendered screen**

Run (seed a profile with one badge + L2 xp, then render via the CLI path):
```bash
R=$(mktemp -d)
cat > "$R/profile.json" <<'JSON'
{ "milestones": [], "totals": { "turns": 0, "dmg": 0, "kills": 0 }, "gear": {},
  "xp": 150, "badges": [ { "id": "first-blood", "unlockedAt": 1780000000000 } ] }
JSON
SLIME_ROOT="$R" node scripts/achievements.js
rm -rf "$R"
```
Expected: a `🏅  ACHIEVEMENTS` header, a `Lv2 Novice (50/200 XP)` line, `Badges (1/6)`, then `✅ First Blood` and five `🔒 … (locked)` rows.

- [ ] **Step 7: Full suite + typecheck**

Run:
```bash
node --test test/ 2>&1 | grep -E '^# (tests|pass|fail)'
npm run typecheck
```
Expected: `# fail 0`; typecheck banner only.

- [ ] **Step 8: Commit**

```bash
git add scripts/achievements.js commands/achievements.md test/achievements.test.js
git commit -m "feat(progression): /slime:achievements — level, title & badge grid

New command renders the player's level/title line and the badge grid (owned
✅ vs locked 🔒), pulling names from the locale catalog. Pure render() unit-
tested; CLI wrapper reads profile.json. Phase 3 complete.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage (Phase 3 only):** spec Phase 3 = "`data/badges.json` + `evaluateBadges` + `applyDefeat` emits `badge_unlocked`; arena unlock cutscene; `/slime:achievements` grid."
- `data/badges.json` → Task 1. ✓
- `evaluateBadges` (+ `deriveStats` from the spec's stat-derivation list) → Task 2. ✓
- emit `badge_unlocked` on defeat → Task 3 (both callers; the spec's `applyDefeat` role is fulfilled by the existing `boss.recordDefeat`, which is where XP/level already live — no separate orchestrator is introduced, matching the current codebase). ✓
- `/slime:achievements` grid → Task 4. ✓
- **arena unlock cutscene → deferred** (documented in the header's Scope note; bundled with the un-wired Phase 2 `level_up` handler into a later arena-FX plan). Gap is intentional and recorded. ✓
- Idempotency (spec risk "XP double-count / badge re-award") → Task 2 (`evaluateBadges` excludes owned) + Task 3 idempotency test. ✓
- i18n both languages + completeness test → Task 1. ✓
- Old profiles back-fill → `deriveStats` tolerates missing fields (Task 2 Step 2 "empty/old profile" test; `recordDefeat` does `prof.badges = prof.badges || []`). ✓

**Placeholder scan:** none — every code step shows full code; every command has expected output; eyeball steps seed real data. ✓

**Type consistency:**
- `recordDefeat` return shape `{total, level, leveledUp, titleKey, newBadges}` is identical in Task 3 Step 3 (impl) and consumed as `r.newBadges` in Steps 5–6. ✓
- `BadgeDef` fields `{id, nameKey, stat, gte}` match `data/badges.json` (Task 1) and the type (Task 2 Step 1) and `evaluateBadges`/`nameKeyFor` usage (Task 2 Step 4). ✓
- `deriveStats` returns exactly `{bossCount, kills, maxCombo, projects, nightKills, badgeCount}` — the six `stat` values any `BadgeDef.stat` can take (Task 2 Step 1 union ↔ Step 4 return). ✓
- `progression` exports `BADGES`, `deriveStats`, `evaluateBadges`, `nameKeyFor` (Task 2 Step 4) — all consumed in Tasks 3–4. ✓
- locale keys `badge.unlocked`, `ach.title`, `ach.level`, `ach.badgesHeader`, `ach.locked`, `badge.*` defined in Task 1 ↔ used in Tasks 3–4. ✓
- `ach.level` template vars `{level,title,into,span}` (Task 1) match `render`'s `fmt` call (Task 4 Step 3). ✓

**Risk check:** loop-variable shadowing of the session `id` in `hook-stop.js` is explicitly called out and avoided (`bid`) in Task 3 Step 5. `require('../data/badges.json')` is a static bundled read (cached by `require`, no runtime IO in any hot hook path — badge eval runs only in the cold defeat path). `new Date(at).getHours()` is deterministic given `at` (no `Date.now()` in the derivation), so `deriveStats` stays replay-stable.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-08-progression-phase3-badges.md`. Four tasks, each ending green (`node --test test/` + `npm run typecheck`). Phase 4 (auto-quests) and Phase 5 (loot/dopamine), plus the deferred arena reward cutscenes, get their own plans after Phase 3 lands.

Two execution options:
1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks.
2. **Inline Execution** — execute the four tasks in this session via executing-plans, checkpoint after each commit.
