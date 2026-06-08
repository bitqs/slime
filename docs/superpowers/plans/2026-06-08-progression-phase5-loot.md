# Progression Phase 5 — Random Rewards (Loot Drops) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each damaging tool call a ~3% deterministic chance to drop bonus XP (5/10/15, symbolic) plus a sparkle — surfaced as a `loot_drop` event in the arena and echoed in the statusline.

**Architecture:** A declarative `data/loot.json` (chance + weighted reward table) and a pure, deterministic `core/loot.js` engine (`roll(seed, table?)` seeded via the existing `mapper.hash` — no `Math.random()`), wired into the existing `if (ev.dmg && p.cwd)` block of `scripts/hook-posttool.js`. The roll runs once live in the fail-soft hook; XP is applied to the profile in-hook and the `loot_drop` event is display-only, so SSE replay never double-counts. Surfaced in `public/arena.js` (floater + sparkle, governor/`?calm=1` safe) and the statusline (via `snap.lastText`).

**Tech Stack:** Node ≥20 builtin `node:test`/`assert`; JSDoc + `tsc --checkJs` strict; flat i18n catalogs `data/locales/{en,zh}.json`. No new deps, no build step.

---

## File Structure

- Create `data/loot.json` — the declarative chance + reward table (the Vibe seam).
- Create `core/loot.js` — pure `roll(seed, table?) → Reward | null`. One responsibility: decide a drop deterministically. Depends only on `mapper.hash` + the JSON.
- Create `test/loot.test.js` — unit tests for `roll`.
- Modify `data/locales/en.json` + `data/locales/zh.json` — `loot.drop` + three reward name keys.
- Modify `test/locale-badges.test.js` — extend the locale-parity test to cover loot keys.
- Modify `core/types.d.ts` — `SlimeEvent` gains `loot?/xp?/fx?`; `Snapshot` gains `resolves?`.
- Modify `scripts/hook-posttool.js` — roll loot inside the existing damaging-resolve block, apply XP, emit `loot_drop`, set `snap.lastText`.
- Modify `public/arena.js` — a `loot_drop` visual (floater + sparkle) + audio mapping.

**Reward model (locked):** `Reward = { id, weight, xp, nameKey, fx }`. `chance` ∈ [0,1]. Drop gate = `hash(seed) % 10000 < round(chance*10000)`. Reward pick uses a **second** hash `hash(seed + ':pick')` over cumulative weights, so the drop decision and the choice are independent. Symbolic XP (5/10/15) keeps leveling honest.

---

### Task 1: Declarative loot table + locale keys

**Files:**
- Create: `data/loot.json`
- Modify: `data/locales/en.json`, `data/locales/zh.json`
- Test: `test/locale-badges.test.js`

- [ ] **Step 1: Create `data/loot.json`**

```json
{
  "chance": 0.03,
  "rewards": [
    { "id": "xp_small",  "weight": 6, "xp": 5,  "nameKey": "loot.xpSmall",  "fx": "spark" },
    { "id": "xp_medium", "weight": 3, "xp": 10, "nameKey": "loot.xpMedium", "fx": "spark" },
    { "id": "xp_big",    "weight": 1, "xp": 15, "nameKey": "loot.xpBig",    "fx": "burst" }
  ]
}
```

- [ ] **Step 2: Add English locale keys**

In `data/locales/en.json`, the quest block currently ends:

```json
  "quest.done": "🎯 Quest complete — {name}"
```

Replace with (add a comma, append four keys):

```json
  "quest.done": "🎯 Quest complete — {name}",
  "loot.drop": "✨ Loot — +{xp} XP {name}",
  "loot.xpSmall": "trinket",
  "loot.xpMedium": "relic",
  "loot.xpBig": "treasure"
```

- [ ] **Step 3: Add Chinese locale keys**

In `data/locales/zh.json`, the quest block currently ends:

```json
  "quest.done": "🎯 任务完成 — {name}"
```

Replace with:

```json
  "quest.done": "🎯 任务完成 — {name}",
  "loot.drop": "✨ 战利品 — +{xp} 经验 {name}",
  "loot.xpSmall": "小玩意",
  "loot.xpMedium": "遗物",
  "loot.xpBig": "宝藏"
```

- [ ] **Step 4: Extend the locale-parity test**

Append to `test/locale-badges.test.js`:

```js
const loot = require('../data/loot.json');

test('loot.json: ids unique, reward shape valid', () => {
  const ids = loot.rewards.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate loot id');
  assert.equal(typeof loot.chance, 'number');
  for (const r of loot.rewards) {
    assert.ok(r.id && r.nameKey && r.fx, `loot missing field: ${JSON.stringify(r)}`);
    assert.equal(typeof r.weight, 'number');
    assert.equal(typeof r.xp, 'number');
  }
});

test('every loot nameKey + loot.drop resolve in en and zh', () => {
  const en = read('en');
  const zh = read('zh');
  for (const k of ['loot.drop', ...loot.rewards.map((r) => r.nameKey)]) {
    assert.ok(en[k], `en missing ${k}`);
    assert.ok(zh[k], `zh missing ${k}`);
  }
});
```

(`test`, `assert`, and `read(lang)` already exist at the top of that file. Reuse them.)

- [ ] **Step 5: Run the new tests — verify they pass**

Run: `node --test test/locale-badges.test.js`
Expected: PASS (existing + the two new subtests).

- [ ] **Step 6: Commit**

```bash
git add data/loot.json data/locales/en.json data/locales/zh.json test/locale-badges.test.js
git commit -m "feat(loot): declarative loot table + locale keys"
```

---

### Task 2: Pure loot engine — `core/loot.js`

**Files:**
- Create: `core/loot.js`
- Test: `test/loot.test.js`

- [ ] **Step 1: Write the failing tests**

Create `test/loot.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const loot = require('../core/loot');

const TBL = {
  chance: 1,
  rewards: [
    { id: 'a', weight: 6, xp: 5, nameKey: 'loot.a', fx: 'spark' },
    { id: 'b', weight: 3, xp: 10, nameKey: 'loot.b', fx: 'spark' },
    { id: 'c', weight: 1, xp: 15, nameKey: 'loot.c', fx: 'burst' },
  ],
};

test('roll: deterministic — same seed + table returns the same reward', () => {
  for (const s of ['x', 'y', 'session:42']) {
    assert.strictEqual(loot.roll(s, TBL), loot.roll(s, TBL));
  }
});

test('roll: chance 0 never drops', () => {
  const t = { ...TBL, chance: 0 };
  for (let i = 0; i < 200; i++) assert.equal(loot.roll('k' + i, t), null);
});

test('roll: chance 1 always drops', () => {
  for (let i = 0; i < 200; i++) assert.ok(loot.roll('k' + i, TBL));
});

test('roll: chance ~0.03 keeps drops rare', () => {
  const t = { ...TBL, chance: 0.03 };
  let drops = 0;
  for (let i = 0; i < 2000; i++) if (loot.roll('s' + i, t)) drops++;
  // hash is uniform enough that ~3% of 2000 lands well under 10%
  assert.ok(drops > 0 && drops < 200, `expected rare drops, got ${drops}/2000`);
});

test('roll: weighted — common reward beats rare, rare still appears', () => {
  const counts = {};
  for (let i = 0; i < 600; i++) {
    const r = loot.roll('w' + i, TBL);
    counts[r.id] = (counts[r.id] || 0) + 1;
  }
  assert.ok(counts.a > counts.c, `expected a (w6) > c (w1): ${JSON.stringify(counts)}`);
  assert.ok(counts.c >= 1, 'rare reward c should still appear');
});

test('roll: reward pick is decorrelated from the drop gate (>=2 distinct ids)', () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) { const r = loot.roll('d' + i, TBL); if (r) seen.add(r.id); }
  assert.ok(seen.size >= 2, `expected variety, saw ${[...seen]}`);
});

test('roll: a dropped reward carries the fields the loot_drop event needs', () => {
  const r = loot.roll('x', TBL);
  for (const k of ['id', 'xp', 'fx', 'nameKey']) assert.ok(k in r, `reward missing ${k}`);
});

test('roll: fail-soft on missing/empty/malformed tables — returns null, never throws', () => {
  assert.equal(loot.roll('s', { chance: 0.5, rewards: [] }), null);
  assert.equal(loot.roll('s', {}), null);
  assert.equal(loot.roll('s', null), null);
  assert.equal(loot.roll('s', { chance: 1, rewards: [{ id: 'z', weight: 0, xp: 1, nameKey: 'k', fx: 'spark' }] }), null);
});
```

- [ ] **Step 2: Run the tests — verify they FAIL**

Run: `node --test test/loot.test.js`
Expected: FAIL — `Cannot find module '../core/loot'`.

- [ ] **Step 3: Implement `core/loot.js`**

Create `core/loot.js`:

```js
'use strict';
// loot — deterministic random-reward roll. Pure: same (seed, table) → same result.
// Seeded from mapper.hash so the hot path stays Math.random()-free and replay-stable.
const { hash } = require('./mapper');

/** @typedef {{ id: string, weight: number, xp: number, nameKey: string, fx: string }} Reward */
/** @typedef {{ chance: number, rewards: Reward[] }} LootTable */

/** Default table — the declarative add-a-reward seam (data/loot.json). */
const TABLE = /** @type {LootTable} */ (require('../data/loot.json'));

/**
 * Decide a loot drop. Returns the chosen reward or null (no drop / malformed
 * table). Never throws — the caller is the fail-soft PostToolUse hook.
 * @param {string} seed any per-roll string; same seed → same outcome
 * @param {LootTable} [table]
 * @returns {Reward | null}
 */
function roll(seed, table = TABLE) {
  if (!table || !Array.isArray(table.rewards) || table.rewards.length === 0) return null;
  const chance = typeof table.chance === 'number' ? table.chance : 0;
  if (chance <= 0) return null;
  // drop gate: uniform 0..9999 vs the chance threshold
  if ((hash(String(seed)) % 10000) >= Math.round(chance * 10000)) return null;
  // weighted pick via an INDEPENDENT hash so the choice doesn't track the gate
  const total = table.rewards.reduce((s, r) => s + (r.weight > 0 ? r.weight : 0), 0);
  if (total <= 0) return null;
  let pick = hash(String(seed) + ':pick') % total;
  for (const r of table.rewards) {
    const w = r.weight > 0 ? r.weight : 0;
    if (pick < w) return r;
    pick -= w;
  }
  return null;
}

module.exports = { roll, TABLE };
```

- [ ] **Step 4: Run the tests — verify they PASS**

Run: `node --test test/loot.test.js`
Expected: PASS (all 8 subtests).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add core/loot.js test/loot.test.js
git commit -m "feat(loot): pure deterministic roll engine"
```

---

### Task 3: Types + wire loot into the damaging-resolve hot path

**Files:**
- Modify: `core/types.d.ts`
- Modify: `scripts/hook-posttool.js`

> This task is integration glue around the already-tested `roll`. There is no new
> pure logic to unit-test; it is verified by the full suite staying green +
> typecheck + a manual smoke (Step 4), the same way the Phase 4 arena wiring was.

- [ ] **Step 1: Extend the types**

In `core/types.d.ts`, find the `SlimeEvent` interface. It already has optional
display fields like `badge?: string;` and `quest?: string;`. Add three more
alongside them (if any of these keys already exists, leave it and add only the
missing ones):

```ts
  loot?: string;
  xp?: number;
  fx?: string;
```

Then find the `Snapshot` interface and add a per-session roll counter alongside
its other optional fields:

```ts
  resolves?: number;
```

- [ ] **Step 2: Wire the loot roll into `scripts/hook-posttool.js`**

In `scripts/hook-posttool.js`, locate the damaging-resolve block. It ends like this:

```js
      boss.save(p.cwd, b);
      snap.boss = { name: b.name, hp: b.hp, broken: !!b.broken };
    }
```

Insert the loot roll just before that block's closing `}` (still inside
`if (ev.dmg && p.cwd) { ... }`, so it only fires on damaging resolves):

```js
      boss.save(p.cwd, b);
      snap.boss = { name: b.name, hp: b.hp, broken: !!b.broken };
      // loot: a damaging resolve has a small, deterministic chance to drop bonus XP.
      // Seed from a per-session counter (persisted on snap) → no Math.random in the
      // hot path. XP is applied once here; the loot_drop event is display-only, so
      // SSE replay never re-rolls or double-counts.
      const seed = id + ':' + (snap.resolves = (snap.resolves || 0) + 1);
      const drop = require('../core/loot').roll(seed);
      if (drop) {
        const prof = state.readProfile();
        prof.xp = (prof.xp || 0) + drop.xp;
        state.writeProfile(prof);
        const lang = locale.current();
        const lootText = locale.fmt(locale.t('loot.drop', lang), { xp: drop.xp, name: locale.t(drop.nameKey, lang) });
        state.appendEvent(id, { t: Date.now(), kind: 'loot_drop', loot: drop.id, xp: drop.xp, fx: drop.fx, text: lootText });
        snap.lastText = lootText;
      }
    }
```

(`id`, `snap`, `state`, and `locale` are already required/in scope at the top of
the hook. Everything stays inside the whole-body `try { … } catch {}` — fail-soft
preserved.)

- [ ] **Step 3: Full suite + typecheck**

Run: `node --test test/` then `npm run typecheck`
Expected: all pass; no type errors. (Confirms the widened `SlimeEvent`/`Snapshot`
typecheck across all `appendEvent`/snapshot callers.)

- [ ] **Step 4: Smoke-test the drop end-to-end with a forced chance**

Temporarily force a guaranteed drop to confirm the wiring writes XP and emits the
event, then revert. Run:

```bash
node -e '
const os=require("os"),path=require("path"),fs=require("fs");
process.env.SLIME_ROOT=path.join(os.tmpdir(),"slime-loot-smoke-"+process.pid);
const state=require("./core/state"); state.ensureDirs();
const loot=require("./core/loot");
const drop=loot.roll("smoke:1",{chance:1,rewards:[{id:"xp_big",weight:1,xp:15,nameKey:"loot.xpBig",fx:"burst"}]});
const prof=state.readProfile(); const before=prof.xp||0; prof.xp=before+drop.xp; state.writeProfile(prof);
const after=state.readProfile().xp;
console.log("drop:",drop.id, "xp",before,"->",after, after===before+15?"OK":"FAIL");
fs.rmSync(process.env.SLIME_ROOT,{recursive:true,force:true});
'
```

Expected: `drop: xp_big xp 0 -> 15 OK`.

- [ ] **Step 5: Commit**

```bash
git add core/types.d.ts scripts/hook-posttool.js
git commit -m "feat(loot): roll loot on damaging resolves, apply XP, emit loot_drop"
```

---

### Task 4: Arena reacts to `loot_drop` (floater + sparkle + audio)

**Files:**
- Modify: `public/arena.js`

> `public/arena.js` is excluded from `tsc` and has no node unit test. This adds a
> floater + CALM-gated sparkle (no `PRIM.flash`, so the ≤3-flash/sec governor is
> never touched) and a sound mapping. Verified by edit inspection + the suite
> staying green; a full browser eyeball (Step 3) is left to the human.

- [ ] **Step 1: Add the visual handler in `handleEvent`**

In `public/arena.js`, inside `function handleEvent(ev)`, after the `if (d.kind === 'turn_end') { … }` block and before `EXTRA_HANDLERS.forEach(...)`, add:

```js
    if (d.kind === 'loot_drop') {
      floater(`+${d.xp} XP`, 238, 100, P.gold, 10, true);
      floater('✨', 238, 88, P.gold, 11, true);
      if (!CALM && d.fx === 'burst') burst(238, 112, P.gold, 9);
      if (d.text) pushLog(d.text);
    }
```

(`floater`, `burst`, `P`, `CALM`, and `pushLog` are all in scope in this IIFE.
`floater` adds plain text nodes — not flashes — so the governor is unaffected;
the only particle effect is the CALM-gated `burst` for the rare `burst` fx.)

- [ ] **Step 2: Add the audio mapping**

In `public/arena.js`, in the `audioFor(d)` switch, the loot sparkle reuses the
existing `potion` sound. Change this line:

```js
      case 'potion': A.play('potion'); break;
```

to:

```js
      case 'potion': case 'loot_drop': A.play('potion'); break;
```

- [ ] **Step 3: Verify the edits + suite**

Run:

```bash
grep -n "loot_drop" public/arena.js
node -e "require('node:fs').readFileSync('public/arena.js','utf8'); console.log('arena readable')"
node --test test/
```

Expected: `grep` shows the two `loot_drop` lines (handler + audio); file reads;
suite still fully green. `npm run typecheck` clean (arena.js is excluded from tsc).

Optional human eyeball:

```bash
SLIME_ROOT=/tmp/slime-demo node scripts/demo-feed.js &
SLIME_ROOT=/tmp/slime-demo SLIME_PORT=4118 node scripts/serve.js
# in another shell:
echo '{"t":0,"kind":"loot_drop","loot":"xp_big","xp":15,"fx":"burst","text":"✨ Loot — +15 XP treasure"}' >> /tmp/slime-demo/sessions/*.jsonl
# open http://127.0.0.1:4118  → expect a "+15 XP" + ✨ floater and a gold burst
```

- [ ] **Step 4: Commit**

```bash
git add public/arena.js
git commit -m "feat(arena): loot_drop floater + sparkle + potion sfx"
```

---

## Self-Review

**1. Spec coverage** (against `2026-06-08-progression-phase5-loot-design.md`):
- `data/loot.json` chance + weighted rewards → Task 1. ✓
- `core/loot.js` pure `roll(seed, table?)`, hash gate + independent weighted pick, fail-soft → Task 2. ✓
- Wire into `if (ev.dmg && p.cwd)`, per-session seed counter, apply XP once in-hook, emit `loot_drop`, `snap.lastText` echo → Task 3. ✓
- Types `SlimeEvent.loot/xp/fx`, `Snapshot.resolves` → Task 3 Step 1. ✓
- Arena floater + sparkle, governor/CALM safe → Task 4. ✓
- Statusline echo via `snap.lastText` → Task 3 (no `hud` signature change, as designed). ✓
- i18n en+zh parity for `loot.drop` + reward names → Task 1 + parity test. ✓
- Determinism / replay-safety / observer fail-soft → engine purity (Task 2) + in-hook-once XP + display-only event + everything inside the hook try/catch (Task 3). ✓
- Symbolic XP (5/10/15) → Task 1 data. ✓
- Testing: determinism, gate, weighted, fail-soft, fields, locale parity → Task 2 + Task 1. ✓

**2. Placeholder scan:** every code step shows complete code; the only deferred item (browser eyeball) is an explicitly-optional human step with a concrete command. No TBD/TODO. ✓

**3. Type consistency:** the reward shape `{ id, weight, xp, nameKey, fx }` is identical across `data/loot.json` (Task 1), the `Reward` typedef + `roll` (Task 2), and the event built in the hook (Task 3, reads `drop.id/xp/fx/nameKey`). Event kind is `loot_drop` with fields `loot/xp/fx/text` in the hook (Task 3), the `SlimeEvent` type (Task 3 Step 1), and the arena reader (Task 4, reads `d.xp/d.fx/d.text`). `snap.resolves` defined in `Snapshot` (Task 3 Step 1) and used as the seed counter (Task 3 Step 2). Consistent. ✓

---

## Execution Handoff

Implement task-by-task with the REQUIRED SUB-SKILL. Each task ends green
(`node --test test/` + `npm run typecheck`) and is its own commit. Order:
data/locale → engine → types+wiring → arena.
