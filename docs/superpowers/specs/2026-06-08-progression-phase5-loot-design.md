# Progression Phase 5 — Random Rewards (Loot Drops) Design Spec

> Phase 5 of the Progression & Achievements line (see
> `2026-06-08-progression-achievements-design.md`). Phases 1–4 (kill log, levels,
> badges, quests) are shipped. This is the final dopamine layer.

## Problem

Progress in Slime is currently fully *earned* — XP, levels, badges, and quests all
derive from real work (kills, damage, streaks). That is honest but predictable:
the player always knows what each action is worth. A variable-ratio surprise —
the slot-machine reward schedule — is the single strongest engagement primitive,
and Slime has none. Resolved tool calls land with no chance of a pleasant surprise.

## Goal

Give each *damaging* tool call a small, random chance to drop a bonus reward —
a little surprise XP plus a sparkle — surfaced instantly in the arena and echoed
in the statusline. Keep it deterministic per session (replay-stable, no
`Math.random()` in the hot path) and declarative (drop chance + reward table in
`data/loot.json`, Vibe-friendly to extend).

## Non-goals (YAGNI)

- No inventory, no collectible items, no equipment.
- No badge-nudge / partial-badge mechanic (considered and cut — couples loot to
  the badge engine for little gain).
- No new persisted state beyond the XP already on the profile.
- No new hook — loot rolls inside the existing `PostToolUse` hook.
- Loot XP does **not** meaningfully accelerate leveling: it is symbolic (5–15)
  against kill XP (~250), so "levels reflect real work" stays true.

## Decisions (resolved at brainstorm)

- **Reward type:** bonus XP + a cosmetic sparkle. One mechanical effect (XP),
  one purely-visual effect (FX). No other reward kinds.
- **Drop chance:** rare & juicy — `~3%` per damaging resolve. Variable-ratio
  rewards land best when sparse.
- **XP magnitude:** symbolic — 5 / 10 / 15, weighted toward the smallest.
- **Trigger:** damaging resolves only (the `if (ev.dmg)` path in
  `hook-posttool.js`), i.e. edits/writes that dealt damage — never reads/searches.
  Ties loot to real effort.
- **Determinism:** seeded from a per-session resolve counter via the existing
  `mapper.hash`. Same seed → same outcome. The roll runs once, live, in the hook;
  the result is recorded as a `loot_drop` event, so SSE replay reproduces the
  drop without re-rolling and without re-applying XP.

## Architecture

Two new units, mirroring the badges/quests seam (declarative data + pure engine),
plus wiring into the existing hot path and surfaces.

### Data — `data/loot.json`

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

A reward = `{ id, weight, xp, nameKey, fx }`. Adding one is a single JSON line plus
two locale keys. `fx` is a hint the arena maps to a visual (`spark` = light
sparkle, `burst` = bigger pop). `chance` is the per-roll probability.

### Engine — `core/loot.js` (pure, deterministic, no IO)

```ts
// Deterministic loot roll. `seed` is any string; same seed + same table → same
// result. Returns the chosen reward or null (no drop). Tolerates a missing/
// malformed table by returning null (fail-soft).
roll(seed: string, table?: LootTable): Reward | null
```

- Loads `data/loot.json` once at require time as the default `table` (like
  `BADGES` in `core/progression.js`); callers normally call `roll(seed)`.
- Gate: `hash(seed) % 10000 < chance * 10000` → a drop occurs; else `null`.
- Weighted pick: a **second, independent** hash `hash(seed + ':pick')` indexes
  into the cumulative-weight distribution, so the drop decision and the reward
  choice don't correlate.
- Defensive: if `table` is absent, `rewards` is empty, or total weight is 0,
  return `null` — never throw (the hot path is fail-soft).

### Wiring — `scripts/hook-posttool.js`

Inside the existing `if (ev.dmg && p.cwd) { … }` block (after the boss-HP update,
still inside the whole-body try/catch), add a loot roll:

1. `const seed = id + ':' + (snap.resolves = (snap.resolves || 0) + 1);`
   — a per-session monotonic counter; `snap` is already persisted via
   `state.writeSnapshot(id, snap)` at the end of the hook.
2. `const drop = require('../core/loot').roll(seed);`
3. On a drop:
   - `const prof = state.readProfile(); prof.xp = (prof.xp || 0) + drop.xp; state.writeProfile(prof);`
     — XP applied **once, live, in-hook** (identical idempotency model to the
     level/badge XP in `recordDefeat`). The event below is display-only.
   - `state.appendEvent(id, { t: Date.now(), kind: 'loot_drop', loot: drop.id, xp: drop.xp, fx: drop.fx, text: locale.fmt(locale.t('loot.drop', lang), { xp: drop.xp, name: locale.t(drop.nameKey, lang) }) });`
   - `snap.lastText = <the loot text>;` so the next statusline render echoes it
     (transient; overwritten by the next resolve/turn line — acceptable).

> Replay safety: the arena consumes the `loot_drop` *event*; it never calls
> `loot.roll` and never writes the profile. XP cannot be double-counted on replay
> or across consumers. The deterministic seed only matters for the single live
> roll and to keep the hot path `Math.random()`-free.

### Surfacing

- **Arena (`public/arena.js`)**: a `loot_drop` case plays a brief sparkle and an
  "+N XP" floater. It reuses existing FX/floater primitives and respects the
  ≤3-flash/sec governor and `?calm=1` / `prefers-reduced-motion` degradation.
  The exact primitive (`spark`/`burst` → which existing call) is selected during
  planning by reading `arena.js`; if no suitable floater exists, the MVP maps
  `loot_drop` to the existing `potion` sparkle and notes a bespoke floater as
  optional polish.
- **Statusline (`core/hud.js` via `scripts/statusline.js`)**: no signature
  change — the loot line rides on `snap.lastText`, already sanitized by
  `hud.sanitize` on render.
- **i18n (`data/locales/{en,zh}.json`)**: `loot.drop` ("✨ Loot — +{xp} XP
  {name}" / "✨ 战利品 — +{xp} 经验 {name}"), `loot.xpSmall`, `loot.xpMedium`,
  `loot.xpBig`. Both catalogs.

### Types — `core/types.d.ts`

- `SlimeEvent` gains `loot?: string; xp?: number; fx?: string;`.
- `Snapshot` gains `resolves?: number;` (the per-session roll counter).
- A `Reward` / `LootTable` typedef for `core/loot.js`.

## Testing strategy

- **`core/loot.js` (pure, fully unit-tested):**
  - Determinism: `roll(seed)` returns the identical result across repeated calls.
  - Gate: with `chance: 0`, every seed returns `null`; with `chance: 1`, every
    seed returns a reward.
  - Weighted distribution: over many distinct seeds with `chance: 1`, each reward
    id appears with frequency roughly proportional to its weight (assert each
    weighted reward appears at least once and the rare one is rarer than the
    common one — no flaky exact ratios; seeds are fixed, so the test is
    deterministic).
  - Decorrelation: the drop gate and the reward pick use different hashes (assert
    that flipping only `:pick` derivation changes the chosen reward, not the gate).
  - Fail-soft: `roll(seed, { chance: 0.5, rewards: [] })`, `roll(seed, {})`, and
    `roll(seed, null)` all return `null` without throwing.
- **Locale parity:** a test asserting every `loot.*` key (the three reward names
  + `loot.drop`) resolves in both en and zh — extend the existing locale test.
- **Event shape:** assert the `loot_drop` event carries `loot`, `xp`, `fx`, and a
  non-empty `text`.
- **Test isolation:** any test that requires `core/state` (e.g. an integration
  test of the hook path, if added) sets `process.env.SLIME_ROOT` to a tmpdir
  before requiring — per the repo rule.

## Risks & mitigations

- **Hot-path cost** → `roll` is two integer hashes; profile IO only on the ~3% of
  damaging resolves that actually drop. Negligible, and entirely inside the
  fail-soft try/catch.
- **Observer-principle breach** → all loot code lives in the existing
  hook try/catch; a malformed `loot.json` yields `null`, no throw, no blocking.
  Claude's behavior stays byte-identical.
- **Replay double-count** → XP applied once in-hook; the event is display-only;
  consumers never roll or write. Covered by the wiring contract above.
- **Leveling distortion** → symbolic XP (5–15) is <6% of one kill's XP; loot
  cannot meaningfully outpace earned progress.
- **Statusline flicker** → loot rides on `snap.lastText`, a field that already
  changes every resolve; no new persistent UI, sanitized on render.

## Implementation note

This is a single, self-contained phase — one engine file, one data file, one
hot-path wiring, three surfaces (arena/statusline/i18n). It fits a single
implementation plan with no decomposition.
