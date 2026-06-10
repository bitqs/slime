# Weapon & magic FX + randomized moves

**Date:** 2026-06-10
**Status:** Implemented (239 tests; live-verified via playwright incl. ?calm=1)
**Scope:** new `public/moves.js` (+`test/moves.test.js`), `public/arena.js`, `public/index.html`, `scripts/serve.js` (whitelist)

## Goal

Every tool strike picks a random **move** — element-flavored weapon/magic FX —
instead of the single fixed lunge. Research-backed (see sources in the plan):
shuffled-bag randomness, 3rd-consecutive-hit finishers, PRD-paced ~5% crit
cinematics; FX built from cheap pooled primitives (shockwave ring, speedlines,
additive slash arc, midpoint-displacement lightning, elemental particle
presets, actor-local impact flash, smear-scaled lunge).

## Module split

### `public/moves.js` — pure logic, UMD (node-testable like sequencer.js)

`SlimeMoves.createPicker(rng?)` → `pick(tool, combo)` returns
`{ element, move, tier, jitter, name: {en, zh} }`.

- **Element by tool**: Edit/Write/NotebookEdit → `blade`; Bash → `fire`;
  Grep/Glob → `lightning`; Read → `holy`; WebFetch/WebSearch → `ice`;
  everything else → `arcane`.
- **Shuffle bag** per element (4 moves each): refill+reshuffle when empty,
  no immediate repeat across the refill boundary. (Uniform random produces
  repeat streaks that read as "no content".)
- **Tier**: `crit` (PRD: base 5%, +2% per non-crit, reset on crit) beats
  `finisher` (combo > 0 && combo % 3 === 0) beats `normal`.
- **Jitter**: scale ±20%, particle-count multiplier — identical replays feel
  canned.
- rng injectable for deterministic tests; defaults to Math.random.

### `public/arena.js` — render layer

New PRIMs (all pooled `fx.particles`/Graphics, all CALM-degraded, flashes
through the existing governor):

- `shockwave({x, y, color})` — expanding circle stroke, additive, ~250 ms.
- `speedlines({x, y, color})` — 10-14 radial lines converging on impact.
- `slasharc({x, y, color})` — additive crescent sweep at the target.
- `lightning({x1, y1, x2, y2})` — jagged polyline, random midpoint
  displacement, 2-3 flickers then gone (not redrawn per frame forever).
- `impactframe({targets})` — 2-frame white overlay rect over actor bounds
  (actor-local ≪ 25% of field — WCAG-safer than full-screen flash);
  governor-gated.
- `elemburst(element, x, y, n)` — per-element particle presets:
  fire rises (yellow→red), ice shards fall slow (steel/white), lightning
  sparks, holy pillar + rising gold sparkles, arcane purple swirl,
  blade steel chips.

Knight attack choreography replaces the bare `fx.knightLunge = 6`:
**anticipation** (2-4 frames coil back) → **lunge** with smear (scale along
swing axis on the fastest frames) → **recovery** ease-out. Escalates by tier
(finisher: bigger windup; crit: composed cinematic — hitstop + zoom +
letterbox flash + impactframe + move-name floater, reserved so it stays
special).

Wiring in `handleEvent`:
- `cast` → `picker.pick(d.tool, combo)` stored as the pending move; play the
  move's attack-side FX (element trail on the lunge, lightning/holy/etc.).
- `resolve` with dmg → impact-side FX from the pending move (shockwave,
  speedlines, elemburst at the boss), tier escalation; floater shows the
  move name (current lang) on finisher/crit only — normals stay quiet to
  avoid visual mud.

## Constraints (unchanged hard rules)

- Flash governor ≤3/s still arbitrates every flash-class effect; `?calm=1`
  and `prefers-reduced-motion` degrade: no impactframe/smear/shake, particle
  counts quartered, lightning becomes a single faint line, crit cinematic
  reduces to bigtext + floater.
- No new deps, no build; moves.js is vendored vanilla UMD, whitelisted in
  serve.js exactly like minions.js, `<script>`-tagged in index.html before
  arena.js.
- Demo worker serves `../public` verbatim — gets everything for free.
- Move names live in moves.js with `{en, zh}`; arena picks by current lang.

## Testing

`test/moves.test.js` (node, seeded rng): bag exhausts all 4 moves before
repeating; no immediate repeat across refill; finisher exactly on 3rd
consecutive; PRD crit rate within [3%, 8%] over 10k picks and never 2 crits
in a row at base rate; element mapping per tool; jitter bounds.
Arena FX: manual via demo feed (normal + `?calm=1`), screenshot pass.
