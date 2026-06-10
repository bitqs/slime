# Combat honesty — boss budget sanity + anti-farm

**Date:** 2026-06-10
**Status:** Spec only — not implemented
**Scope:** `core/estimate.js`, `scripts/hook-prompt.js`, `core/mapper.js`,
`scripts/hook-posttool.js`, `data/badges.json`
**Pillar at stake:** "combat stays real" (`docs/GAME-DESIGN.md` §8) — numbers
must track real work, or the whole integrity of the metaphor erodes.

## Problems

### P1 — Boss HP scales with prompt *verbosity*, not task scope

`estimateTokens` (`core/estimate.js:17`) is `15000 + steps·12000 + ascii·4 +
cjk·12` over the **first prompt's characters**, and `hook-prompt.js:19` freezes
the budget forever: `if (!b.estLines) b.estLines = estLines(est)`.

Consequences:

- Paste a 50k-char error log as your first message → `est ≈ 215k` →
  `estLines ≈ 620` → a RAID-BOSS tank that takes days of edits to whittle,
  for what might be a one-line fix. The boss persists per-cwd until killed.
- Conversely a terse "fix the race in flushQueue" on a week-long refactor
  spawns a 40-line piñata that dies the first afternoon.
- Later prompts **never** raise a stale budget — a fight that grew in scope
  stays priced at its first sentence.

### P2 — Test-rerun farming

`mapper.js:172-177`: any passing `bash` whose command matches
`/\b(test|spec|pytest|jest|vitest|tape|--test)\b/` sets `ev.kill = true` →
+1 kill, +20 XP (`xpForDefeat`), combo retained. Re-running the same green
suite 30 times = 30 kills, 600 XP, plus `weekly_kills` quest progress —
without changing a line.

### P3 — Todo-churn ULTIMATE

`hook-posttool.js`: a TodoWrite where **all** todos are `completed` and the
boss still has HP triggers the ULTIMATE finisher — boss to 0, broken, then
auto-down with full kill XP. A one-item todo list marked done is an instant
boss kill. Combined with P1's per-cwd boss respawn, this is a kill mill.

### P4 — Mid-game badge desert (minor, same theme: the curve must stay honest)

`data/badges.json`: ~5 badges land in week 1, then nothing until 25 bosses /
50 kills. The collection surface goes quiet exactly when the novelty wears off.

## Design

### D1 — Clamp the budget, let it breathe

1. **Clamp** `estLines` output to `[40, 400]` (today: floor 40, no ceiling →
   2600 at the 900k token cap). 400 lines ≈ a genuinely large feature; bigger
   work should be *multiple bosses* (it already is, per-cwd per-kill), not one
   sponge.
2. **Re-estimate on every prompt; budgets may only grow, and only damp-ed:**
   `b.estLines = max(b.estLines, round(0.5 · estLines(newEst) + 0.5 · b.estLines))`
   — a long fight that genuinely grows in scope re-prices upward (still
   clamped at 400); a stray verbose prompt can at most nudge it. Never
   shrinks: HP = `1 - dmgTaken/estLines` must not jump down mid-fight
   (no phantom healing, no surprise kill).
3. HP recompute after a raise uses the existing formula — the boss visibly
   "toughens" (HP ticks up) with an arena `feedBeat`, which the metaphor
   already supports (feeding the slime).

### D2 — Diminishing returns on repeated test passes

Track on the boss: `testKillSig` (hash of the matched command) +
`testKillCount`. First green run of a given command = full kill (+20 XP,
quest credit). Same-signature repeats within the same fight: no `kill` flag,
no XP — keep the `resolve` text but swap the locale line for a "already
cleared" variant (e.g. "🛡 the field is already clear"). A *different* test
command (new sig) is a fresh kill. State lives on BossState, so it resets
naturally when the boss dies.

Why not time-window rate limiting: signature-scoped is deterministic,
replay-stable, and doesn't punish legitimately running many *different*
suites.

### D3 — ULTIMATE requires a real fight

Gate the all-todos-done finisher on the fight having actually happened:
require `b.fightDmg ≥ 0.25 · b.estLines` (a quarter of the budget in real
edits) for the instant finish. Below that, todos-done still breaks the boss
(`broken: true`, HP floor 1) but does **not** zero HP — the kill confirms
only when real damage or the Stop hook's natural path lands. Keeps the
satisfying finisher for real work; removes the one-todo kill mill.

### D4 — Fill the badge desert

Add mid-band badges to `data/badges.json` (declarative, no code):
8 bosses, 15 bosses, 20 kills, 35 kills, 3 projects, maxCombo 15,
streak-longest 14 (needs a `longestStreak` stat in `deriveStats` — one line).
Names follow the existing tone; both locales.

## Guardrail check

- Observer principle: all changes are inside existing hook bodies — fail-soft.
- Determinism: D1 damping is pure arithmetic on stored state; D2 sig-hash uses
  `mapper.hash`; no randomness, no clocks beyond what exists.
- No new deps, no build, i18n keys added in both locales.
- HP never decreases without damage; never increases except the explicit
  re-price (D1.3), which the arena already has a visual verb for.

## Test plan

- estimate: clamp bounds (40/400); damped-growth math; never-shrink.
- mapper/posttool: same-sig second test run → no kill flag; new sig → kill;
  sig resets after defeat.
- posttool ultimate: below dmg floor → broken but HP 1, no boss_down; above →
  current behavior.
- badges: thresholds + locale parity (existing locale-badges test pattern).

## Out of scope

- Real token telemetry as the budget source (would couple game to usage.json
  semantics; revisit after Claude Code exposes per-turn token deltas cleanly).
- Negative XP / punishment of any kind (against the work-companion stance).
