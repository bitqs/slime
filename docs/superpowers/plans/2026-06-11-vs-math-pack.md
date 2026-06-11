# VS Math Pack (v0.3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the four VS-derived systems from `docs/superpowers/specs/2026-06-11-vs-math-pack-design.md`: constant level-up cadence, chest lottery (sealed at spawn, newbie-luck), combo-driven boss HP arc, and slime eggs (infinite micro-growth).

**Architecture:** Two new pure modules (`core/eggs.js`, `core/chest.js`) follow the `core/loot.js` pattern — hash-seeded, deterministic, never throw. Existing seams get wired: `progression.js` gains two pure scaling functions, `boss.recordDefeat` opens the chest, hooks apply combo damage + egg drops, HUD/report/arena render the new events (`chest_open`, `egg_drop`).

**Tech Stack:** Plain Node.js (zero runtime deps), `node --test`, JSDoc + `tsc --checkJs` strict, PixiJS arena (vendored). Read `CLAUDE.md` hard rules first: hooks fail-soft, sanitize all terminal output, locale keys in BOTH en+zh, tests set `SLIME_ROOT` to a tmpdir before requiring libs.

**Working directory:** `/Users/qs/Projects/slime`. Run tests with `node --test test/<file>` from there.

---

### Task 1: Types + locale keys (foundation)

**Files:**
- Modify: `core/types.d.ts`
- Modify: `data/locales/en.json`
- Modify: `data/locales/zh.json`

- [ ] **Step 1: Add type fields**

In `core/types.d.ts`, inside `interface BossState` (after `testKillSigs?: number[];`):

```ts
  // chest lottery: tier sealed at spawn, revealed on defeat (ATOM-L02/L03)
  chestTier?: 'silver' | 'gold' | 'jackpot';
```

Inside `interface Profile` (after `streak?: ...;`):

```ts
  // slime eggs: permanent micro-perk counters; prestige never clears them
  eggs?: { xp?: number; loot?: number; crit?: number; combo?: number };
  // lifetime chests opened (drives the newbie-luck sequence)
  chestCount?: number;
```

Inside `interface SlimeEvent` (after `tier?: number;`):

```ts
  chestTier?: string;
  perk?: string;
```

- [ ] **Step 2: Add locale keys**

In `data/locales/en.json`, after the `"loot.xpBig"` line:

```json
  "chest.open": "🎁 Chest [{tier}] → ✨ {name} +{xp} XP{egg}",
  "chest.egg": " · 🥚 Slime Egg ({perk})",
  "chest.tier.silver": "Silver",
  "chest.tier.gold": "Gold",
  "chest.tier.jackpot": "JACKPOT",
  "egg.drop": "🥚 Slime Egg! {perk} (total {count})",
  "egg.perk.xp": "✨ XP +1%",
  "egg.perk.loot": "🎁 Drop +0.2%",
  "egg.perk.crit": "💥 Crit +0.5%",
  "egg.perk.combo": "🔥 Combo cap +2%",
  "ach.eggsHeader": "🥚 Slime Eggs — {total}",
  "ach.eggLine": "  {perk} ×{count}"
```

In `data/locales/zh.json`, same position:

```json
  "chest.open": "🎁 宝箱[{tier}] → ✨ {name} +{xp} XP{egg}",
  "chest.egg": " · 🥚 史莱姆蛋({perk})",
  "chest.tier.silver": "银",
  "chest.tier.gold": "金",
  "chest.tier.jackpot": "头奖",
  "egg.drop": "🥚 史莱姆蛋!{perk}(累计 {count} 颗)",
  "egg.perk.xp": "✨ XP +1%",
  "egg.perk.loot": "🎁 掉落 +0.2%",
  "egg.perk.crit": "💥 暴击 +0.5%",
  "egg.perk.combo": "🔥 连击上限 +2%",
  "ach.eggsHeader": "🥚 史莱姆蛋 — {total}",
  "ach.eggLine": "  {perk} ×{count}"
```

Mind JSON commas: the previous last entry in each file needs a trailing comma if these are appended at the end of the object.

- [ ] **Step 3: Verify**

Run: `node --test test/locale.test.js test/locale-badges.test.js && npx tsc --noEmit -p tsconfig.json`
Expected: PASS (if `tsc` is missing, run `npm install` once for devDeps).

- [ ] **Step 4: Commit**

```bash
git add core/types.d.ts data/locales/en.json data/locales/zh.json
git commit -m "feat(types,i18n): chest + egg fields and locale keys"
```

---

### Task 2: `core/eggs.js` — slime egg module

**Files:**
- Create: `core/eggs.js`
- Test: `test/eggs.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/eggs.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const eggs = require('../core/eggs');

test('roll: deterministic — same seed same outcome', () => {
  for (const s of ['a', 'b', 'sess:42']) assert.deepEqual(eggs.roll(s), eggs.roll(s));
});

test('roll: ~3% drop rate over many seeds', () => {
  let drops = 0;
  for (let i = 0; i < 10000; i++) if (eggs.roll('seed' + i)) drops++;
  assert.ok(drops > 150 && drops < 450, `expected ~300 drops, got ${drops}`);
});

test('roll: bonus raises the rate (luck cross-cuts, ATOM-L04)', () => {
  let base = 0, boosted = 0;
  for (let i = 0; i < 5000; i++) {
    if (eggs.roll('s' + i)) base++;
    if (eggs.roll('s' + i, 0.05)) boosted++;
  }
  assert.ok(boosted > base, `boosted ${boosted} ≤ base ${base}`);
});

test('pickPerk: weighted ≈ 40/30/25/5 over many seeds', () => {
  const n = { xp: 0, loot: 0, crit: 0, combo: 0 };
  for (let i = 0; i < 10000; i++) n[eggs.pickPerk('p' + i).id]++;
  assert.ok(n.xp > 3500 && n.xp < 4500, `xp ${n.xp}`);
  assert.ok(n.loot > 2500 && n.loot < 3500, `loot ${n.loot}`);
  assert.ok(n.crit > 2000 && n.crit < 3000, `crit ${n.crit}`);
  assert.ok(n.combo > 250 && n.combo < 750, `combo ${n.combo}`);
});

test('multipliers: zero eggs = identity; counts scale linearly', () => {
  assert.equal(eggs.xpMult({}), 1);
  assert.equal(eggs.lootBonus({}), 0);
  assert.equal(eggs.critBonus({}), 0);
  assert.equal(eggs.comboCap({}), 2);
  const p = { eggs: { xp: 10, loot: 5, crit: 4, combo: 3 } };
  assert.ok(Math.abs(eggs.xpMult(p) - 1.10) < 1e-9);
  assert.ok(Math.abs(eggs.lootBonus(p) - 0.01) < 1e-9);
  assert.ok(Math.abs(eggs.critBonus(p) - 0.02) < 1e-9);
  assert.ok(Math.abs(eggs.comboCap(p) - 2.12) < 1e-9);
});

test('comboCap: hard ceiling ×3 (ATOM-P08)', () => {
  assert.equal(eggs.comboCap({ eggs: { combo: 999 } }), 3);
});

test('grant: increments and tolerates missing eggs object', () => {
  const p = {};
  assert.equal(eggs.grant(p, 'xp'), 1);
  assert.equal(eggs.grant(p, 'xp'), 2);
  assert.equal(eggs.total(p), 2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/eggs.test.js`
Expected: FAIL with `Cannot find module '../core/eggs'`

- [ ] **Step 3: Write the implementation**

Create `core/eggs.js`:

```js
'use strict';
// eggs — the infinite micro-growth layer (VS golden-egg analog, ATOM-G07).
// Each egg permanently bumps one tiny stat; a hundred eggs make a god.
// Pure + deterministic (mapper.hash-seeded) and prestige never clears them.
const { hash } = require('./mapper');

/** @typedef {import('./types').Profile} Profile */

/** Drop chance per confirmed kill (loot-egg bonus cross-cuts it). */
const EGG_CHANCE = 0.03;

/** Perk pool — weighted pick, one perk per egg. */
const PERKS = [
  { id: 'xp',    weight: 40, nameKey: 'egg.perk.xp' },    // +1% xp gain
  { id: 'loot',  weight: 30, nameKey: 'egg.perk.loot' },  // +0.2% drop chance
  { id: 'crit',  weight: 25, nameKey: 'egg.perk.crit' },  // +0.5% arena crit base
  { id: 'combo', weight: 5,  nameKey: 'egg.perk.combo' }, // +2% combo dmg cap (rare)
];

/** @param {Profile | null | undefined} profile @returns {{ xp: number, loot: number, crit: number, combo: number }} */
function counts(profile) {
  const e = (profile && profile.eggs) || {};
  return { xp: e.xp || 0, loot: e.loot || 0, crit: e.crit || 0, combo: e.combo || 0 };
}

/** @param {Profile | null | undefined} profile @returns {number} */
function total(profile) {
  const c = counts(profile);
  return c.xp + c.loot + c.crit + c.combo;
}

/** Multiplier on xp gains from xp-eggs. @param {Profile | null | undefined} profile @returns {number} */
function xpMult(profile) { return 1 + 0.01 * counts(profile).xp; }
/** Additive drop-chance bonus — cross-cuts loot, egg and chest rolls (ATOM-L04).
 *  @param {Profile | null | undefined} profile @returns {number} */
function lootBonus(profile) { return 0.002 * counts(profile).loot; }
/** Additive arena crit-base bonus (cosmetic; consumed by public/moves.js).
 *  @param {Profile | null | undefined} profile @returns {number} */
function critBonus(profile) { return 0.005 * counts(profile).crit; }
/** Combo damage multiplier ceiling: base ×2, each combo-egg widens it, hard cap ×3.
 *  @param {Profile | null | undefined} profile @returns {number} */
function comboCap(profile) { return Math.min(3, 2 * (1 + 0.02 * counts(profile).combo)); }

/** Weighted perk pick on a salted seed. @param {string} seed @returns {(typeof PERKS)[number]} */
function pickPerk(seed) {
  const totalW = PERKS.reduce((s, p) => s + p.weight, 0);
  let pick = hash('egg-pick:' + String(seed)) % totalW;
  for (const p of PERKS) {
    if (pick < p.weight) return p;
    pick -= p.weight;
  }
  return PERKS[0]; // unreachable with integer weights; safety net
}

/** Roll an egg drop. @param {string} seed @param {number} [bonus] @returns {(typeof PERKS)[number] | null} */
function roll(seed, bonus = 0) {
  const chance = Math.min(1, Math.max(0, EGG_CHANCE + bonus));
  if ((hash('egg:' + String(seed)) % 10000) >= Math.round(chance * 10000)) return null;
  return pickPerk(seed);
}

/** Apply one egg (mutates profile). @param {Profile} profile @param {string} perkId @returns {number} new count */
function grant(profile, perkId) {
  const e = profile.eggs || (profile.eggs = {});
  const k = /** @type {keyof typeof e} */ (perkId);
  e[k] = (e[k] || 0) + 1;
  return /** @type {number} */ (e[k]);
}

module.exports = { EGG_CHANCE, PERKS, counts, total, xpMult, lootBonus, critBonus, comboCap, pickPerk, roll, grant };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/eggs.test.js`
Expected: PASS (if the ~3% band assertion fails, the hash distribution is the suspect — do NOT widen the band past [100, 600] without checking `roll` math).

- [ ] **Step 5: Commit**

```bash
git add core/eggs.js test/eggs.test.js
git commit -m "feat(eggs): slime egg micro-growth module — weighted perks, luck cross-cut"
```

---

### Task 3: `core/chest.js` — chest lottery

**Files:**
- Create: `core/chest.js`
- Test: `test/chest.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/chest.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const chest = require('../core/chest');

const REWARDS = [
  { id: 'xp_small',  weight: 6, xp: 15, nameKey: 'loot.xpSmall',  fx: 'spark' },
  { id: 'xp_medium', weight: 3, xp: 30, nameKey: 'loot.xpMedium', fx: 'spark' },
  { id: 'xp_big',    weight: 1, xp: 60, nameKey: 'loot.xpBig',    fx: 'burst' },
];

test('rollTier: newbie sequence scripted for the first 6 chests (ATOM-L01)', () => {
  const expect = ['silver', 'silver', 'gold', 'silver', 'silver', 'jackpot'];
  for (let i = 0; i < 6; i++) {
    // any seed: the sequence must win regardless
    assert.equal(chest.rollTier('seed' + i, i), expect[i]);
  }
});

test('rollTier: honest odds from chest #7 — ≈5% jackpot / ≈19% gold / rest silver', () => {
  const n = { silver: 0, gold: 0, jackpot: 0 };
  for (let i = 0; i < 10000; i++) n[chest.rollTier('s' + i, 6)]++;
  assert.ok(n.jackpot > 300 && n.jackpot < 700, `jackpot ${n.jackpot}`);
  assert.ok(n.gold > 1400 && n.gold < 2400, `gold ${n.gold}`);
  assert.ok(n.silver > 7000, `silver ${n.silver}`);
});

test('rollTier: luck bonus shifts tiers upward', () => {
  let j0 = 0, j1 = 0;
  for (let i = 0; i < 5000; i++) {
    if (chest.rollTier('s' + i, 6) === 'jackpot') j0++;
    if (chest.rollTier('s' + i, 6, 0.10) === 'jackpot') j1++;
  }
  assert.ok(j1 > j0, `boosted ${j1} ≤ base ${j0}`);
});

test('rollTier: deterministic', () => {
  assert.equal(chest.rollTier('same', 10), chest.rollTier('same', 10));
});

test('ensureTier: stamps once, never re-rolls', () => {
  const b = { name: 'Boss', created: 123 };
  const t1 = chest.ensureTier(b, 7);
  assert.ok(['silver', 'gold', 'jackpot'].includes(t1));
  assert.equal(chest.ensureTier(b, 999), t1); // different count → still sealed
});

test('open: jackpot always carries an egg; weights shift toward big', () => {
  let bigs = 0;
  for (let i = 0; i < 1000; i++) {
    const r = chest.open('j' + i, 'jackpot', REWARDS);
    assert.equal(r.egg, true);
    assert.notEqual(r.reward.id, 'xp_small'); // weight 0 in jackpot
    if (r.reward.id === 'xp_big') bigs++;
  }
  assert.ok(bigs > 550, `expected xp_big majority, got ${bigs}`);
});

test('open: silver eggs are rare (~10%)', () => {
  let eggs = 0;
  for (let i = 0; i < 5000; i++) if (chest.open('s' + i, 'silver', REWARDS).egg) eggs++;
  assert.ok(eggs > 300 && eggs < 700, `eggs ${eggs}`);
});

test('open: malformed rewards → null reward, never throws', () => {
  const r = chest.open('x', 'gold', []);
  assert.equal(r.reward, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/chest.test.js`
Expected: FAIL with `Cannot find module '../core/chest'`

- [ ] **Step 3: Write the implementation**

Create `core/chest.js`:

```js
'use strict';
// chest — boss-kill lottery. The tier is SEALED when the boss spawns and only
// revealed on defeat (ATOM-L02/L03: the player can't reroll by stalling, and
// the reveal stays a surprise). Pure + deterministic, never throws.
const { hash } = require('./mapper');

/** @typedef {import('./types').BossState} BossState */
/** @typedef {{ id: string, weight: number, xp: number, nameKey: string, fx: string }} Reward */
/** @typedef {'silver' | 'gold' | 'jackpot'} Tier */

/** Newbie-luck script (ATOM-L01): taste gold early, hit the jackpot once,
 *  then fall back to honest odds. Indexed by lifetime chestCount. */
const NEWBIE_SEQ = /** @type {Tier[]} */ (['silver', 'silver', 'gold', 'silver', 'silver', 'jackpot']);

// three-die downgrade (ATOM-L03): roll jackpot, then gold; silver is the floor
const JACKPOT_CHANCE = 0.05;
const GOLD_CHANCE = 0.20;

/** Reward-id weights per tier — higher tiers shift toward bigger trinkets. */
const TIER_WEIGHTS = /** @type {Record<Tier, Record<string, number>>} */ ({
  silver:  { xp_small: 6, xp_medium: 3, xp_big: 1 },
  gold:    { xp_small: 2, xp_medium: 5, xp_big: 3 },
  jackpot: { xp_small: 0, xp_medium: 3, xp_big: 7 },
});

/** Chance the chest also carries a slime egg; the jackpot always does. */
const EGG_CHANCE = /** @type {Record<Tier, number>} */ ({ silver: 0.10, gold: 0.30, jackpot: 1 });

/** @param {string} seed @param {number} chestCount lifetime opened @param {number} [bonus] luck @returns {Tier} */
function rollTier(seed, chestCount, bonus = 0) {
  if (chestCount >= 0 && chestCount < NEWBIE_SEQ.length) return NEWBIE_SEQ[chestCount];
  const gate = (salt, chance) =>
    (hash(salt + String(seed)) % 10000) < Math.round(Math.min(1, Math.max(0, chance + bonus)) * 10000);
  if (gate('tier-j:', JACKPOT_CHANCE)) return 'jackpot';
  if (gate('tier-g:', GOLD_CHANCE)) return 'gold';
  return 'silver';
}

/** Stamp a sealed tier on a boss (no-op when already present). Mutates + returns it.
 *  @param {BossState} b @param {number} chestCount @param {number} [bonus] @returns {Tier} */
function ensureTier(b, chestCount, bonus = 0) {
  if (!b.chestTier) b.chestTier = rollTier(String(b.name) + ':' + (b.created || 0), chestCount, bonus);
  return b.chestTier;
}

/** Open a chest: weighted reward pick + egg side-roll.
 *  @param {string} seed @param {Tier | string} tier @param {Reward[]} rewards @param {number} [bonus]
 *  @returns {{ tier: string, reward: Reward | null, egg: boolean }} */
function open(seed, tier, rewards, bonus = 0) {
  const t = /** @type {Tier} */ (TIER_WEIGHTS[/** @type {Tier} */ (tier)] ? tier : 'silver');
  const w = TIER_WEIGHTS[t];
  const pool = (Array.isArray(rewards) ? rewards : []).filter((r) => (w[r.id] || 0) > 0);
  const totalW = pool.reduce((s, r) => s + w[r.id], 0);
  /** @type {Reward | null} */
  let reward = null;
  if (totalW > 0) {
    let pick = hash('chest-pick:' + String(seed)) % totalW;
    for (const r of pool) {
      if (pick < w[r.id]) { reward = r; break; }
      pick -= w[r.id];
    }
  }
  const eggChance = Math.min(1, Math.max(0, EGG_CHANCE[t] + bonus));
  const egg = (hash('chest-egg:' + String(seed)) % 10000) < Math.round(eggChance * 10000);
  return { tier: t, reward, egg };
}

module.exports = { NEWBIE_SEQ, TIER_WEIGHTS, EGG_CHANCE, JACKPOT_CHANCE, GOLD_CHANCE, rollTier, ensureTier, open };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/chest.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add core/chest.js test/chest.test.js
git commit -m "feat(chest): boss-kill lottery — sealed tier, three-die roll, newbie luck"
```

---

### Task 4: progression — `levelScale` + `comboDmgMult`

**Files:**
- Modify: `core/progression.js`
- Test: `test/progression.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/progression.test.js`:

```js
test('levelScale: identity at L1, +12% per level after', () => {
  assert.equal(prog.levelScale(1), 1);
  assert.ok(Math.abs(prog.levelScale(10) - 2.08) < 1e-9);
  assert.equal(prog.levelScale(0), 1);      // defensive floor
  assert.equal(prog.levelScale(undefined), 1);
});

test('levelScale: cadence converges — kills/level stays in [0.3, 3] through L25 (ATOM-P02)', () => {
  const perKill = (lv) => Math.round(prog.xpForDefeat({ dmg: 42 }) * prog.levelScale(lv));
  for (let lv = 1; lv < 25; lv++) {
    const need = prog.xpToReach(lv + 1) - prog.xpToReach(lv);
    const kills = need / perKill(lv);
    assert.ok(kills > 0.3 && kills < 3, `L${lv}: ${kills.toFixed(2)} kills/level`);
  }
});

test('comboDmgMult: 1 at combo 0, +8% per combo, capped (ATOM-P14)', () => {
  assert.equal(prog.comboDmgMult(0), 1);
  assert.ok(Math.abs(prog.comboDmgMult(5) - 1.4) < 1e-9);
  assert.equal(prog.comboDmgMult(50), 2);          // default cap ×2
  assert.equal(prog.comboDmgMult(50, 2.12), 2.12); // egg-widened cap
  assert.equal(prog.comboDmgMult(-3), 1);          // defensive
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/progression.test.js`
Expected: FAIL with `prog.levelScale is not a function`

- [ ] **Step 3: Implement**

In `core/progression.js`, after the `xpForDefeat` function (line ~47), add:

```js
/** Reward-side level scaling (ATOM-P02 constant cadence): demand stays
 *  50·n·(n−1) — old saves migrate for free — while supply grows with level,
 *  so kills/level converges (~2-3) instead of slowing forever, and the same
 *  punch prints a bigger number. @param {number} [level] @returns {number} */
function levelScale(level) {
  return 1 + 0.12 * Math.max(0, (level || 1) - 1);
}

/** In-fight power curve (ATOM-P14 two-curves race): boss HP damage scales
 *  with the live combo so a fight reads grind → surge; one miss resets to the
 *  grind. Visual layer only — XP always reads raw dmg.
 *  @param {number} combo @param {number} [cap] @returns {number} */
function comboDmgMult(combo, cap = 2) {
  return Math.min(cap, 1 + 0.08 * Math.max(0, combo || 0));
}
```

Add `levelScale, comboDmgMult` to the `module.exports` object on the last line.

- [ ] **Step 4: Run to verify pass**

Run: `node --test test/progression.test.js`
Expected: PASS (all pre-existing tests too — nothing existing was touched).

- [ ] **Step 5: Commit**

```bash
git add core/progression.js test/progression.test.js
git commit -m "feat(progression): levelScale for constant cadence + comboDmgMult for fight arc"
```

---

### Task 5: loot.roll luck bonus

**Files:**
- Modify: `core/loot.js:19-25`
- Test: `test/loot.test.js`

- [ ] **Step 1: Write the failing test**

Append to `test/loot.test.js` (it already defines `TBL` with `chance: 1`):

```js
test('roll: bonus param raises the drop gate (luck cross-cut)', () => {
  const t = { ...TBL, chance: 0.04 };
  let base = 0, boosted = 0;
  for (let i = 0; i < 5000; i++) {
    if (loot.roll('lb' + i, t)) base++;
    if (loot.roll('lb' + i, t, 0.10)) boosted++;
  }
  assert.ok(boosted > base, `boosted ${boosted} ≤ base ${base}`);
});

test('roll: bonus clamps — chance + bonus > 1 still behaves like 1', () => {
  for (let i = 0; i < 50; i++) assert.ok(loot.roll('c' + i, TBL, 5) !== undefined);
});
```

- [ ] **Step 2: Run to verify fail**

Run: `node --test test/loot.test.js`
Expected: FAIL (first new test: `boosted` equals `base` because the third arg is ignored).

- [ ] **Step 3: Implement**

In `core/loot.js`, change the `roll` signature and the chance line:

```js
/**
 * Decide a loot drop. Returns the chosen reward or null (no drop / malformed
 * table). Never throws — the caller is the fail-soft PostToolUse hook.
 * @param {string} seed any per-roll string; same seed → same outcome
 * @param {LootTable} [table]
 * @param {number} [bonus] additive luck (loot-egg cross-cut, ATOM-L04)
 * @returns {Reward | null}
 */
function roll(seed, table = TABLE, bonus = 0) {
  if (!table || !Array.isArray(table.rewards) || table.rewards.length === 0) return null;
  // clamp to a valid probability so bad data (e.g. chance > 1) can't mean "always drop"
  const chance = Math.min(1, Math.max(0, (typeof table.chance === 'number' ? table.chance : 0) + bonus));
```

(The rest of the body is unchanged.)

- [ ] **Step 4: Run to verify pass**

Run: `node --test test/loot.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add core/loot.js test/loot.test.js
git commit -m "feat(loot): optional luck bonus on the drop gate"
```

---

### Task 6: `recordDefeat` — level scaling, egg XP mult, chest open

**Files:**
- Modify: `core/boss.js:119-149` (recordDefeat)
- Test: `test/boss.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/boss.test.js` (follow the file's existing SLIME_ROOT-tmpdir pattern — it is already set at the top of this file):

IMPORTANT — order-robustness: tests in this file SHARE one SLIME_ROOT, and from this task on EVERY `recordDefeat` (including the pre-existing tests above) opens a chest and may grant eggs. New tests must read the profile BEFORE the defeat and assert relative to it, never against absolute counts or the raw newbie slot 0.

```js
test('recordDefeat: opens a chest — tier follows the newbie sequence slot, counter advances', () => {
  const state = require('../core/state');
  const chest = require('../core/chest');
  const before = state.readProfile().chestCount || 0;
  const b = boss.loadOrCreate('/p/chest1', 'fix chest bug');
  b.dmgTaken = 5;
  const r = boss.recordDefeat('/p/chest1', b, { dmg: 5, kills: 0, maxCombo: 0 });
  assert.ok(r.chest, 'defeat result carries chest info');
  if (before < chest.NEWBIE_SEQ.length) {
    assert.equal(r.chest.tier, chest.NEWBIE_SEQ[before]); // scripted sweetener slot
  } else {
    assert.ok(['silver', 'gold', 'jackpot'].includes(r.chest.tier));
  }
  assert.ok(r.chest.rewardXp > 0);
  assert.equal(state.readProfile().chestCount, before + 1);
});

test('recordDefeat: newbie sequence pays gold + jackpot, jackpot guarantees an egg', () => {
  const state = require('../core/state');
  const chest = require('../core/chest');
  const tiers = [];
  // burn through the rest of the newbie window (wherever this file left it)
  while ((state.readProfile().chestCount || 0) < chest.NEWBIE_SEQ.length) {
    const i = state.readProfile().chestCount || 0;
    const eggsBefore = require('../core/eggs').total(state.readProfile());
    const b = boss.loadOrCreate('/p/seq' + i, 'fix seq');
    b.dmgTaken = 1;
    const r = boss.recordDefeat('/p/seq' + i, b, { dmg: 1 });
    tiers.push(r.chest.tier);
    if (r.chest.tier === 'jackpot') {
      assert.ok(r.chest.eggPerk, 'jackpot always carries an egg');
      assert.equal(require('../core/eggs').total(state.readProfile()), eggsBefore + 1);
    }
  }
  // the full lifetime sequence (including chests opened by earlier tests)
  // must have been exactly NEWBIE_SEQ — spot-check the tail we just opened
  const seqTail = chest.NEWBIE_SEQ.slice(chest.NEWBIE_SEQ.length - tiers.length);
  assert.deepEqual(tiers, seqTail);
});

test('recordDefeat: kill XP scales with the level at kill time', () => {
  const state = require('../core/state');
  const prog = require('../core/progression');
  const eggsMod = require('../core/eggs');
  const prof = state.readProfile();
  prof.xp = prog.xpToReach(10); // park the player at L10
  state.writeProfile(prof);
  const prof0 = state.readProfile(); // multipliers as of kill time
  const b = boss.loadOrCreate('/p/scale', 'fix scale');
  b.dmgTaken = 42;
  const r = boss.recordDefeat('/p/scale', b, { dmg: 42, kills: 0, maxCombo: 0 });
  const base = prog.xpForDefeat({ dmg: 42, kills: 0, maxCombo: 0 });
  const expectKill = Math.round(base * prog.levelScale(10) * prog.prestigeMult(prof0) * eggsMod.xpMult(prof0));
  // xpGained = scaled kill + chest reward (+ any badge/quest XP)
  assert.ok(r.xpGained >= expectKill, `xpGained ${r.xpGained} < scaled kill ${expectKill}`);
});
```

Also UPDATE the existing test at `test/boss.test.js:148-159` (`returns xpGained covering kill + badge XP`): its exact-equality assertion now under-counts (chest XP) and may over- or under-shoot (level scaling + egg multipliers from earlier tests in this file). Recompute from the pre-defeat profile — insert before the `recordDefeat` call:

```js
  const eggsMod = require('../core/eggs');
  const prof0 = require('../core/state').readProfile();
  const fromLevel = prog.levelFor(prof0.xp || 0).level;
```

and replace the assertion line with:

```js
  const killPart = Math.round(killXp * prog.levelScale(fromLevel) * prog.prestigeMult(prof0) * eggsMod.xpMult(prof0));
  const chestPart = Math.round(r.chest.rewardXp * prog.prestigeMult(prof0) * eggsMod.xpMult(prof0));
  const badgePart = Math.round(prog.BADGE_XP * prog.prestigeMult(prof0));
  assert.equal(r.xpGained, killPart + chestPart + badgePart);
```

- [ ] **Step 2: Run to verify fail**

Run: `node --test test/boss.test.js`
Expected: FAIL — `r.chest` is undefined.

- [ ] **Step 3: Implement**

In `core/boss.js`, replace the body of `recordDefeat` (keep the JSDoc, extend its @returns):

```js
/** Push a milestone, award XP (kill + chest + badge + quest), recompute level
 *  once all XP has landed, unlock any newly-earned badges, open the sealed
 *  chest, and clear the boss file.
 *  @param {string} cwd @param {BossState} b
 *  @param {{ dmg?: number; kills?: number; maxCombo?: number }} [stats]
 *  @returns {{ total: number, level: number, leveledUp: boolean, titleKey: string, newBadges: string[], newQuests: string[], xpGained: number, chest: { tier: string, rewardXp: number, rewardNameKey: string | null, eggPerk: string | null } }} */
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
  const eggs = require('./eggs');
  const chest = require('./chest');
  const loot = require('./loot');
  const xpBefore = prof.xp || 0;
  const fromLevel = prog.levelFor(xpBefore).level;
  // kill XP: base × level scaling (constant cadence) × prestige × xp-eggs
  prof.xp = xpBefore + Math.round(
    prog.xpForDefeat(m) * prog.levelScale(fromLevel) * prog.prestigeMult(prof) * eggs.xpMult(prof));
  // chest: sealed at spawn, revealed now. Pre-upgrade bosses without a tier
  // get one here so old fights still pay out.
  const luck = eggs.lootBonus(prof);
  const count = prof.chestCount || 0;
  const tier = chest.ensureTier(b, count, luck);
  const opened = chest.open(String(b.name) + ':' + (b.created || 0) + ':' + count, tier, loot.TABLE.rewards, luck);
  prof.chestCount = count + 1;
  /** @type {string | null} */
  let eggPerk = null;
  if (opened.reward) {
    prof.xp += Math.round(opened.reward.xp * prog.prestigeMult(prof) * eggs.xpMult(prof));
  }
  if (opened.egg) {
    const perk = eggs.pickPerk(String(b.name) + ':' + (b.created || 0) + ':' + count);
    eggs.grant(prof, perk.id);
    eggPerk = perk.id;
  }
  // badges: evaluate against the now-updated profile, persist new ones (+XP each)
  prof.badges = prof.badges || [];
  const newBadges = prog.evaluateBadges(prof);
  const now = Date.now();
  for (const id of newBadges) prof.badges.push({ id, unlockedAt: now });
  if (newBadges.length) prof.xp += Math.round(prog.BADGE_XP * newBadges.length * prog.prestigeMult(prof));
  // quests: a fresh kill can complete weekly_kills (idempotent; streak handled
  // per-turn). evaluateQuests pays quest XP into prof.xp itself.
  const { completed: newQuests } = prog.evaluateQuests(prof, now);
  // level: computed once, after kill + chest + badge + quest XP have all landed
  const lv = prog.levelFor(prof.xp);
  prof.level = lv.level;
  state.writeProfile(prof);
  clear(cwd);
  return {
    total: prof.milestones.length, level: lv.level, leveledUp: lv.level > fromLevel,
    titleKey: lv.titleKey, newBadges, newQuests, xpGained: prof.xp - xpBefore,
    chest: {
      tier: opened.tier,
      rewardXp: opened.reward ? opened.reward.xp : 0,
      rewardNameKey: opened.reward ? opened.reward.nameKey : null,
      eggPerk,
    },
  };
}
```

Design note: badge/quest XP intentionally stays prestige-only (milestone rewards, not the repeatable stream — spec ①). Egg xpMult applies to kill + chest XP, the per-fight streams.

- [ ] **Step 4: Run to verify pass**

Run: `node --test test/boss.test.js && node --test test/`
Expected: boss tests PASS. If other suites (hooks, defeat-flow) assert exact `xpGained`/profile XP totals, each failure is the chest reward landing — update those assertions the same way as Step 1's update (add `r.chest.rewardXp` / read the actual chest from the result). Do not weaken assertions to `ok(...)` if equality is computable.

- [ ] **Step 5: Commit**

```bash
git add core/boss.js test/boss.test.js
git commit -m "feat(boss): defeat pays scaled XP and opens the sealed chest"
```

---

### Task 7: defeat-flow — chest reveal line + event

**Files:**
- Modify: `core/defeat-flow.js`
- Test: `test/defeat-flow.test.js`

- [ ] **Step 1: Write the failing test**

Append to `test/defeat-flow.test.js` (follow its existing SLIME_ROOT pattern):

```js
test('rewardLines: chest reveal leads, egg suffix included', () => {
  const r = {
    leveledUp: false, level: 3, titleKey: 'title.apprentice', newBadges: [], newQuests: [],
    chest: { tier: 'gold', rewardXp: 30, rewardNameKey: 'loot.xpMedium', eggPerk: 'crit' },
  };
  const lines = defeatFlow.rewardLines(r, 'en');
  assert.ok(lines[0].includes('Chest'), lines[0]);
  assert.ok(lines[0].includes('Gold'), lines[0]);
  assert.ok(lines[0].includes('+30 XP'), lines[0]);
  assert.ok(lines[0].includes('Slime Egg'), lines[0]);
  assert.ok(lines[0].includes('Crit'), lines[0]);
});

test('rewardLines: chest without egg has no egg suffix; missing chest is fine', () => {
  const r = {
    leveledUp: false, level: 1, titleKey: 'title.novice', newBadges: [], newQuests: [],
    chest: { tier: 'silver', rewardXp: 15, rewardNameKey: 'loot.xpSmall', eggPerk: null },
  };
  assert.ok(!defeatFlow.rewardLines(r, 'en')[0].includes('Egg'));
  // old callers without chest info must not crash
  assert.deepEqual(defeatFlow.rewardLines({ leveledUp: false, newBadges: [], newQuests: [] }, 'en'), []);
});
```

- [ ] **Step 2: Run to verify fail**

Run: `node --test test/defeat-flow.test.js`
Expected: FAIL — no chest line is produced.

- [ ] **Step 3: Implement**

In `core/defeat-flow.js`, after `questText` add:

```js
/** @param {{ tier: string, rewardXp: number, rewardNameKey: string | null, eggPerk: string | null }} c
 *  @param {string} lang @returns {string} */
function chestText(c, lang) {
  const egg = c.eggPerk
    ? locale.fmt(locale.t('chest.egg', lang), { perk: locale.t('egg.perk.' + c.eggPerk, lang) })
    : '';
  return locale.fmt(locale.t('chest.open', lang), {
    tier: locale.t('chest.tier.' + c.tier, lang),
    name: c.rewardNameKey ? locale.t(c.rewardNameKey, lang) : '',
    xp: c.rewardXp,
    egg,
  });
}
```

Update `rewardLines` — chest first (it is the kill's payout), then levelup/badges/quests. Extend the JSDoc param type with `chest?`:

```js
/** @param {{leveledUp:boolean,level:number,titleKey:string,newBadges:string[],newQuests?:string[],chest?:{tier:string,rewardXp:number,rewardNameKey:string|null,eggPerk:string|null}}} r @param {string} lang @returns {string[]} */
function rewardLines(r, lang) {
  const out = [];
  if (r && r.chest && r.chest.rewardXp > 0) out.push(chestText(r.chest, lang));
  if (r && r.leveledUp) out.push(levelupText(r, lang));
  for (const bid of (r && r.newBadges) || []) out.push(badgeText(bid, lang));
  for (const qid of (r && r.newQuests) || []) out.push(questText(qid, lang));
  return out;
}
```

Update `emitRewards` to emit the chest event first (same JSDoc param extension):

```js
function emitRewards(sid, r, lang) {
  if (!sid || !r) return;
  if (r.chest && r.chest.rewardXp > 0) {
    state.appendEvent(sid, {
      t: Date.now(), kind: 'chest_open', chestTier: r.chest.tier,
      xp: r.chest.rewardXp, perk: r.chest.eggPerk || undefined,
      text: chestText(r.chest, lang),
    });
  }
  if (r.leveledUp) {
    state.appendEvent(sid, { t: Date.now(), kind: 'level_up', text: levelupText(r, lang) });
  }
  for (const bid of (r.newBadges || [])) {
    state.appendEvent(sid, { t: Date.now(), kind: 'badge_unlocked', badge: bid, text: badgeText(bid, lang) });
  }
  emitQuests(sid, r.newQuests || [], lang);
}
```

Export `chestText` alongside the rest: `module.exports = { emitRewards, rewardLines, emitQuests, levelupText, chestText };`

- [ ] **Step 4: Run to verify pass**

Run: `node --test test/defeat-flow.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add core/defeat-flow.js test/defeat-flow.test.js
git commit -m "feat(defeat-flow): chest reveal line + chest_open event"
```

---

### Task 8: hooks — seal tier at spawn, combo damage, egg drops, report lines

**Files:**
- Modify: `scripts/hook-prompt.js` (seal chest tier on fresh boss)
- Modify: `scripts/hook-posttool.js` (combo HP mult, egg drop on kill, loot luck)
- Modify: `scripts/hook-stop.js:90` (report picks up chest/egg events)
- Test: `test/hooks.test.js` (and any failing hook test)

- [ ] **Step 1: Write the failing tests**

Append to `test/hooks.test.js`, following its existing harness pattern for invoking hook scripts with a JSON payload on stdin (reuse the file's existing `run`/helper and SLIME_ROOT setup — read the top of the file first and copy the idiom exactly):

```js
test('hook-prompt: a fresh boss gets a sealed chestTier', () => {
  runHook('hook-prompt.js', { session_id: 'chest-s1', cwd: '/p/chesthook', prompt: 'fix the parser' });
  const boss = require('../core/boss');
  const b = boss.loadOrCreate('/p/chesthook', '');
  assert.ok(['silver', 'gold', 'jackpot'].includes(b.chestTier), String(b.chestTier));
});

test('hook-posttool: combo multiplies HP damage (visual layer), fightDmg stays raw', () => {
  // two identical 10-line edits; the second arrives at a higher combo so it
  // must take MORE hp than the first (estLines fixed by the prompt hook)
  runHook('hook-prompt.js', { session_id: 'combo-s1', cwd: '/p/combohook', prompt: 'add feature x' });
  const payload = (n) => ({
    session_id: 'combo-s1', cwd: '/p/combohook', tool_name: 'Edit',
    tool_input: { file_path: '/p/combohook/f' + n + '.js', new_string: 'x\n'.repeat(10) },
    tool_response: {},
  });
  runHook('hook-posttool.js', payload(1));
  const boss = require('../core/boss');
  const afterOne = boss.loadOrCreate('/p/combohook', '').dmgTaken;
  for (let i = 2; i <= 6; i++) runHook('hook-posttool.js', payload(i));
  const b = boss.loadOrCreate('/p/combohook', '');
  assert.equal(b.fightDmg, 60, 'fightDmg is raw lines (6 × 10)');
  assert.ok(b.dmgTaken > 60, `dmgTaken ${b.dmgTaken} should exceed raw 60 (combo mult)`);
  assert.ok(b.dmgTaken - afterOne > 50, 'later hits hit harder than the first');
});
```

NOTE: the exact event-shape the mapper needs to count an Edit as `dmg` lives in `core/mapper.js` — if `tool_input.new_string` lines aren't what `resolve` counts, open `test/mapper.test.js`, copy a known damaging payload from there, and use that instead. The assertion logic stays identical.

- [ ] **Step 2: Run to verify fail**

Run: `node --test test/hooks.test.js`
Expected: new tests FAIL (`chestTier` undefined; `dmgTaken` equals raw 60).

- [ ] **Step 3: Implement hook-prompt sealing**

In `scripts/hook-prompt.js`, right before `boss.save(p.cwd || '', b);` (line ~30):

```js
    // seal the chest tier the moment the boss exists (ATOM-L02: rolled at
    // spawn, revealed on defeat — stalling can't reroll it)
    if (!b.chestTier) {
      try {
        const chest = require('../core/chest');
        const eggs = require('../core/eggs');
        const prof = state.readProfile();
        chest.ensureTier(b, prof.chestCount || 0, eggs.lootBonus(prof));
      } catch {}
    }
```

- [ ] **Step 4: Implement hook-posttool combo damage + egg drop + loot luck**

In `scripts/hook-posttool.js`:

(a) Add requires at the top, after `const loot = require('../core/loot');`:

```js
const eggs = require('../core/eggs');
const prog = require('../core/progression');
```

(b) Replace the `hpHit` line (line ~42):

```js
      // In-fight arc (ATOM-P14): HP damage rides the live combo — grind early,
      // surge once the streak builds; one miss resets it. The per-hit cap below
      // still guarantees ≥4 hits to kill. XP is unaffected — it reads raw dmg.
      const profForCaps = state.readProfile();
      const comboMult = prog.comboDmgMult(ev.combo || 0, eggs.comboCap(profForCaps));
      const hpHit = Math.min(Math.round(ev.dmg * comboMult), Math.ceil(b.estLines * 0.25));
```

(c) Pass luck into the existing loot roll (line ~62) — replace `const drop = loot.roll(seed);` with:

```js
      const drop = loot.roll(seed, undefined, eggs.lootBonus(profForCaps));
```

(d) Egg drop on confirmed kill — add AFTER the whole `if (ev.dmg && p.cwd) { ... }` block (i.e. just before the `TodoWrite` block at line ~85), as its own block (test kills often carry no dmg):

```js
    // slime egg (ATOM-G07): a confirmed kill has a small, luck-adjusted chance
    // to drop a permanent micro-perk. Deterministic seed; XP-free, so no
    // level math needed here.
    if (ev.kill) {
      const prof = state.readProfile();
      const perk = eggs.roll(id + ':egg:' + (snap.kills || 0), eggs.lootBonus(prof));
      if (perk) {
        eggs.grant(prof, perk.id);
        if (state.writeProfile(prof)) {
          const lang = locale.current();
          const text = locale.fmt(locale.t('egg.drop', lang),
            { perk: locale.t(perk.nameKey, lang), count: eggs.total(prof) });
          state.appendEvent(id, { t: Date.now(), kind: 'egg_drop', perk: perk.id, text });
          snap.lastText = text;
        }
      }
    }
```

- [ ] **Step 5: Report picks up the new events**

In `scripts/hook-stop.js` line ~90, extend the reward-kinds condition:

```js
      } else if (e.kind === 'level_up' || e.kind === 'badge_unlocked' || e.kind === 'quest_done'
              || e.kind === 'chest_open' || e.kind === 'egg_drop') {
```

- [ ] **Step 6: Run the full suite**

Run: `node --test test/`
Expected: PASS. Likely fallout to fix deliberately (do not paper over):
- `test/hook-posttool-autodown.test.js` / `test/hooks.test.js`: bosses may now break/auto-down EARLIER because combo-multiplied `dmgTaken` reaches the budget sooner. If a test staged "not yet broken" damage, lower its per-hit line counts so the staged total stays below budget.
- Any test asserting an exact event sequence may now see a `chest_open` (after boss_down) or rare `egg_drop` line — extend the expected sequence, don't filter events.

- [ ] **Step 7: Commit**

```bash
git add scripts/hook-prompt.js scripts/hook-posttool.js scripts/hook-stop.js test/
git commit -m "feat(hooks): sealed chest at spawn, combo-scaled HP damage, egg drops on kills"
```

---

### Task 9: visibility — HUD 🥚 badge, /state eggs, achievements detail

**Files:**
- Modify: `core/hud.js:60-94` (render signature + egg badge)
- Modify: `scripts/statusline.js:34` (pass egg total)
- Modify: `scripts/serve.js:55-68` (handleState exposes eggs)
- Modify: `scripts/achievements.js:9-37` (egg section)
- Test: `test/hud.test.js`, `test/serve.test.js`, `test/achievements.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/hud.test.js` (copy its existing render-call idiom — it already passes level/quest/streak/prestige args):

```js
test('render: egg badge shows after streak when eggs > 0', () => {
  const snap = { sessionId: 's', turn: 1, combo: 0, kills: 0, dmg: 0, summons: 0, inTurn: false, lastText: 'hi', updated: Date.now() };
  const line = hud.render(snap, null, [], Date.now(), null, 'en', null, 5, undefined, 0, 0, 47);
  assert.ok(line.includes('🥚47'), line);
  const none = hud.render(snap, null, [], Date.now(), null, 'en', null, 5, undefined, 0, 0, 0);
  assert.ok(!none.includes('🥚'), none);
});
```

Append to `test/achievements.test.js`:

```js
test('render: egg section lists per-perk counts', () => {
  const out = ach.render({ milestones: [], totals: { turns: 0, dmg: 0, kills: 0 }, gear: {},
    eggs: { xp: 3, crit: 1 } }, 'en');
  assert.ok(out.includes('🥚'), out);
  assert.ok(out.includes('×3'), out);
});
```

Append to `test/serve.test.js` (copy its existing request idiom):

```js
test('/state: exposes egg counts', async () => {
  const res = await get('/state');
  const data = JSON.parse(res.body);
  assert.ok(data.eggs && typeof data.eggs.xp === 'number');
});
```

- [ ] **Step 2: Run to verify fail**

Run: `node --test test/hud.test.js test/achievements.test.js test/serve.test.js`
Expected: new tests FAIL.

- [ ] **Step 3: Implement**

`core/hud.js` — extend `render`'s signature with a final param and JSDoc line `@param {number} [eggs] total slime eggs → shown as a 🥚 badge`:

```js
function render(snap, stdinJson, tips, now, usageCache, lang, live, level, quest, streak, prestige, eggs) {
```

After the `const st = ...` line (line ~69) add:

```js
  const eg = eggs ? ` 🥚${eggs}` : '';
```

And append `${eg}` after `${st}` in BOTH template strings (the between-turns return and the in-turn `parts.push`):

```js
    return `🟢${uiLink(live)}${pr}${lv}${q}${st}${eg}${mSuffix} ${body}`;
```
```js
  parts.push(`🟢${uiLink(live)}${pr}${lv}${q}${st}${eg}${mSuffix}`);
```

`scripts/statusline.js` — extend the render call (line ~34):

```js
  process.stdout.write(hud.render(snap, stdin, tips, Date.now(), usage.readCache(), lang,
    arenaStatus.readLive(), prof.level, quest, streakDays, prof.prestige || 0,
    require('../core/eggs').total(prof)));
```

`scripts/serve.js` — in `handleState`, read the profile once and expose eggs:

```js
    const prof = readProfile();
    const streak = prof.streak || null;
    const eggCounts = require('../core/eggs').counts(prof);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ snapshot, usage, lang, streak, eggs: eggCounts, harness: 'claude-code' }));
```

(Delete the old `const streak = readProfile().streak || null;` line.)

`scripts/achievements.js` — after the quests loop (line ~35), add:

```js
  const eggs = require('../core/eggs');
  const eggCounts = eggs.counts(profile);
  const eggTotal = eggs.total(profile);
  if (eggTotal > 0) {
    lines.push('');
    lines.push(locale.fmt(locale.t('ach.eggsHeader', lang), { total: eggTotal }));
    for (const p of eggs.PERKS) {
      const n = eggCounts[/** @type {keyof typeof eggCounts} */ (p.id)];
      if (n > 0) lines.push(locale.fmt(locale.t('ach.eggLine', lang), { perk: locale.t(p.nameKey, lang), count: n }));
    }
  }
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test test/hud.test.js test/achievements.test.js test/serve.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add core/hud.js scripts/statusline.js scripts/serve.js scripts/achievements.js test/
git commit -m "feat(hud,serve,achievements): surface egg counts everywhere"
```

---

### Task 10: arena — chest cutscene, egg floater, crit-egg wiring

**Files:**
- Modify: `public/arena.js` (~line 975 scenes, ~line 1833 boss_down, ~line 1680 handlers, ~line 1501 applyState, ~line 1790 audio switch)
- Modify: `public/moves.js` (setCritBase)
- Test: `test/moves.test.js`

Arena code is excluded from typecheck and unit tests — verify visually via the demo feed (Step 5). `moves.js` IS unit-tested.

- [ ] **Step 1: moves.js failing test**

Append to `test/moves.test.js` (it already requires the module and builds pickers with a seeded rng):

```js
test('setCritBase: raises the floor, clamps to [base, 0.05]', () => {
  const p = moves.createPicker(() => 0.0049); // rng under a 0.005 base → crit
  p.setCritBase(0.005);
  assert.equal(p.pick('Edit', 1).tier, 'crit');
  const q = moves.createPicker(() => 0.0049);
  // without the boost the same rng must NOT crit on the first pick (base 0.002)
  assert.notEqual(q.pick('Edit', 1).tier, 'crit');
  const r = moves.createPicker(() => 0.9);
  r.setCritBase(99); // clamps to 0.05, never 99
  assert.notEqual(r.pick('Edit', 1).tier, 'crit');
});
```

- [ ] **Step 2: Run to verify fail**

Run: `node --test test/moves.test.js`
Expected: FAIL — `p.setCritBase is not a function`.

- [ ] **Step 3: Implement moves.js**

In `public/moves.js` `createPicker`:

```js
  function createPicker(rng) {
    const rand = rng || Math.random;
    /** @type {Record<string, Array<{ move: string; name: MoveName }>>} */
    const bags = {};
    /** @type {Record<string, string>} */
    const lastMove = {};
    let critBase = CRIT_BASE;
    let critChance = critBase;
    let critCooldown = false;

    /** Egg-boosted crit floor (cosmetic): clamped so it can never run away. @param {number} v */
    function setCritBase(v) {
      critBase = Math.min(0.05, Math.max(CRIT_BASE, Number(v) || CRIT_BASE));
      if (critChance < critBase) critChance = critBase;
    }
```

In `pick`, change the crit-reset line `critChance = CRIT_BASE;` to `critChance = critBase;`, and return both functions:

```js
    return { pick, setCritBase };
```

Run: `node --test test/moves.test.js` → PASS.

- [ ] **Step 4: Arena wiring**

In `public/arena.js`:

(a) After the `SCENE_POTION` definition (~line 980), add the chest cutscene — composed ONLY from existing PRIM verbs (letterbox, dim, bigtext, flash, goldrain, confetti, slowmo, hidetext), so CALM mode keeps degrading them for free. Slot-machine pacing (ATOM-L05): bigger tier, longer show:

```js
  // chest reveal — slot-machine pacing: silver ~1.2s, gold ~2s, jackpot ~3.4s
  function SCENE_CHEST(tier) {
    const big = tier === 'jackpot', mid = tier === 'gold';
    const label = big ? '💰 JACKPOT 💰' : mid ? '🎁 GOLD CHEST' : '🎁';
    return [
      { at: 0, do: 'dim', on: true },
      big ? { at: 0, do: 'letterbox', on: true } : null,
      { at: 4, do: 'bigtext', text: '🎁 …', y: 70 },
      { at: 30, do: 'flash', strength: big ? 0.6 : mid ? 0.45 : 0.3 },
      { at: 32, do: 'bigtext', text: label, y: 70 },
      (big || mid) ? { at: 36, do: 'goldrain' } : null,
      big ? { at: 48, do: 'slowmo', factor: 0.4, frames: 24 } : null,
      big ? { at: 60, do: 'confetti' } : null,
      { at: big ? 190 : mid ? 110 : 66, do: 'hidetext' },
      big ? { at: 194, do: 'letterbox', on: false } : null,
      { at: big ? 196 : mid ? 114 : 70, do: 'dim', on: false },
    ].filter(Boolean);
  }
```

(b) Track the victory beat: near the other `let` state declarations used by `handleEvent` (search for `let engagedBoss`), add:

```js
  let lastBossDownAt = 0;
```

and inside the existing `boss_down` handler (line ~1833), prepend `lastBossDownAt = Date.now();` to its body.

(c) New handlers next to the `loot_drop` handler (~line 1677):

```js
    if (d.kind === 'chest_open') {
      // let the victory ceremony land first, then the reveal (sealed → revealed)
      const delay = Date.now() - lastBossDownAt < 2500 ? 1800 : 0;
      const tier = d.chestTier || 'silver';
      setTimeout(() => { playScene(SCENE_CHEST(tier)); }, delay);
      if (d.text) pushLog(d.text);
    }
    if (d.kind === 'egg_drop') {
      floater('🥚', knight.x + 6, knight.y - 10, P.gold, 12, true);
      if (d.text) pushLog(d.text);
    }
```

(d) Audio switch (~line 1803, beside `case 'loot_drop'`):

```js
      case 'chest_open': case 'egg_drop': A.play('loot'); break;
```

(e) Crit-egg wiring in `applyState` (line ~1501) — after the `lastDataLang` line:

```js
    if (movePicker && data.eggs && movePicker.setCritBase) {
      movePicker.setCritBase(0.002 + 0.005 * (data.eggs.crit || 0));
    }
```

NOTE: `movePicker` is declared at line ~1606, AFTER `applyState`'s definition — that's fine (it's called later), but verify the declaration is in the same scope.

- [ ] **Step 5: Visual verification with the demo feed**

```bash
SLIME_ROOT=/tmp/slime-vsmath node scripts/demo-feed.js &
SLIME_ROOT=/tmp/slime-vsmath SLIME_PORT=4118 node scripts/serve.js &
```

Open `http://127.0.0.1:4118`. Then inject a chest event into the demo session (find the session id under `/tmp/slime-vsmath/sessions/`):

```bash
SID=$(ls /tmp/slime-vsmath/sessions/*.jsonl | head -1 | xargs basename | sed 's/.jsonl//')
echo '{"t":'$(date +%s000)',"kind":"chest_open","chestTier":"jackpot","xp":60,"text":"🎁 Chest [JACKPOT] → ✨ treasure +60 XP · 🥚 Slime Egg (💥 Crit +0.5%)"}' >> /tmp/slime-vsmath/sessions/$SID.jsonl
```

Expected: letterbox + 🎁… + flash + JACKPOT text + goldrain + confetti, log line appears. Repeat with `"chestTier":"silver"` (short beat) and a `{"kind":"egg_drop","perk":"xp","text":"🥚 Slime Egg! ✨ XP +1% (total 1)"}` (🥚 floater). Also check `?calm=1` — no strobing. Kill both background processes when done.

- [ ] **Step 6: Commit**

```bash
git add public/arena.js public/moves.js test/moves.test.js
git commit -m "feat(arena): chest reveal cutscene, egg floater, crit-egg wiring"
```

---

### Task 11: Finish line — full verification, docs, version

**Files:**
- Modify: `package.json` (version 0.2.0 → 0.3.0)
- Modify: `README.md`, `README.zh-CN.md` (feature blurb)

- [ ] **Step 1: Full suite + typecheck**

```bash
node --test test/ && npm run typecheck
```

Expected: ALL PASS. Fix anything red before proceeding (superpowers:verification-before-completion — paste real output, no claims without it).

- [ ] **Step 2: Bump version**

In `package.json`: `"version": "0.3.0"`.

- [ ] **Step 3: README blurbs**

Add to the feature list of `README.md` (match surrounding voice; this is marketing surface — slime-social-first):

```markdown
- **Chest lottery** — every boss seals a chest at spawn (Silver / Gold / JACKPOT) and reveals it on the kill, slot-machine style. Your first six chests follow a lucky streak.
- **Slime eggs** — kills can drop a permanent micro-perk (+1% XP, +0.2% drops, +0.5% crit, rare +2% combo cap). They stack forever and survive prestige.
- **Combo surge** — boss HP damage rides your live combo: grind early, snowball once the streak builds. One failed tool call resets it.
```

And the zh equivalent in `README.zh-CN.md`:

```markdown
- **宝箱开奖** — 每只 boss 出生时封定一只宝箱(银 / 金 / 头奖),击杀才揭晓,老虎机式演出。前六箱自带新手运。
- **史莱姆蛋** — 击杀有概率掉永久微强化(+1% XP、+0.2% 掉率、+0.5% 暴击、稀有 +2% 连击上限),无限累积,转生不清零。
- **连击狂潮** — boss 掉血随连击滚雪球:前期磨血,连上了越打越疼;一次失败回到磨血期。
```

- [ ] **Step 4: Manual smoke in a real session (optional but recommended)**

The dev machine's post-commit hook refreshes the installed plugin; restart the Claude Code session, run a tiny task to a boss kill, and check: turn report shows the 🎁 line, statusline shows 🥚 after the first egg, arena plays the chest beat.

- [ ] **Step 5: Final commit**

```bash
git add package.json README.md README.zh-CN.md
git commit -m "release: v0.3.0 — VS math pack (cadence, chests, combo arc, eggs)"
```

- [ ] **Step 6: Shareable artifact (slime-social-first)**

Re-record `arena.gif` for the README capturing victory → JACKPOT chest reveal (use the demo-feed + injected jackpot event from Task 10 Step 5). This is the round's shareable moment.

---

## Spec coverage map

| Spec section | Tasks |
|---|---|
| ① 升级节拍 (levelScale) | 4, 6 |
| ② 宝箱三骰/新手运/掷骰前置 | 3, 6, 8(prompt) |
| ② 终端揭晓行 | 7, 8(stop) |
| ② arena 老虎机演出 + 处决节拍 | 10 (chest scene; victory ceremony reuses existing SCENE_VICTORY + ASCII banner = existing boss.autoDown line) |
| ③ combo 情绪弧 | 4, 8(posttool) |
| ④ 史莱姆蛋掉落/权重/累积 | 2, 6(chest egg), 8(kill egg) |
| ④ HUD 🥚 / achievements 明细 | 9 |
| ④ 暴击蛋 → arena PRD | 9(/state), 10(moves) |
| 幸运横切 (ATOM-L04) | 2, 3, 5, 8 |
| 兼容迁移(缺字段默认 0) | 2(counts), 3(ensureTier), 6(chestCount fallback) |
| 测试清单 1-7 | 4(节拍), 3(三骰/新手运), 2(蛋权重), 4(combo 封顶), 2+6(老存档默认), 2+3(确定性) |
