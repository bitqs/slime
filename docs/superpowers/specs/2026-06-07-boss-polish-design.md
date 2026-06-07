# Boss System Polish — Design

Date: 2026-06-07
Status: approved

## Goal

Polish the boss system across four areas: name variety, a "broken" (near-death)
lifecycle state, est/tier calibration, and a lang-loss bug fix — plus tests for
all of it. No new dependencies, no LLM calls (observer principle holds).

## 1. Name variety (`scripts/lib/boss.js`)

Today every boss in the same cwd gets the same name: `The {Dir} {Type}` with
five regex types and a Golem fallback.

- Add a per-type **epithet pool**, en and zh, ~8 entries per type (Golem
  included). Selection is `hash(prompt) % pool.length` — deterministic,
  offline, testable. Reuse `hash` from `scripts/lib/mapper.js`.
- Name formats:
  - en: `The {Epithet} {Base} {Type}` → "The Rabid Questline Bugbear"
  - zh: `「{形容词}・{Base}」{类型}` → "「狂暴・Questline」错虫王"
- Epithet pools live in `boss.js` next to `TYPES`/`TYPES_ZH` (they are flavor
  data tied to type logic, not UI strings — locales files stay for UI text).
- Type table unchanged (5 types + Golem). Haiku namer unchanged — when
  `haikuNaming` hits, it still overwrites the whole name.
- Empty prompt (recreate path) hashes deterministically; no special case.

## 2. Broken state (lifecycle)

Today hp=0 does nothing; the kill is only recorded via manual `/questline:defeat`.

- `BossState.broken?: boolean` (types.d.ts).
- In `hook-posttool.js`: when `hpFromTodos` drops hp to 0 and `!b.broken`,
  set `broken = true` and append a one-time `boss_broken` QLEvent
  (`{ t, kind: 'boss_broken', boss: name, text }`). If later todos raise hp
  above 0, clear `broken` silently (no event).
- `snap.boss` carries `broken`; HUD renders a broken variant of the boss line —
  zh `🗡️ {name} ☠ 濒死 — /defeat 斩杀`, en `🗡️ {name} ☠ broken — /defeat to finish`
  (keys in `data/locales/`, both languages, through `hud.sanitize` as ever).
- Arena (`public/arena.js`): on `boss_broken` — kneel pose (gray tint +
  a few px slump) + pulsing FINISH hint. `?calm=1` and
  `prefers-reduced-motion` degrade to a static label, no pulse. `boss_down`
  clears the broken visuals. Flash governor untouched (no new flashes).
- `watch.js`/mapper get a text line for the event.
- `/questline:defeat` semantics unchanged — it works at any hp.

## 3. est + tier

- `scripts/lib/estimate.js`: weight CJK characters ×9 (information density),
  ASCII stays ×3. Bounds (20k floor / 900k cap) and `fmtTokens` unchanged.
- Tier thresholds stay (`<100k normal / <300k ELITE / ≥300k RAID BOSS`).
- Broken gray overrides the tier color on the boss name until the kill.

## 4. Lang-loss fix

`hook-stop.js` and `defeat.js` call `loadOrCreate(cwd, '')` without `lang`; if
the boss file is missing the boss is recreated with an English Golem name even
for zh users.

- Fix inside the lib: `loadOrCreate` defaults `lang` to `locale.current()`
  when omitted. All callers heal at once.

## Testing

`node --test test/` (existing isolation pattern: set `CCQ_ROOT` to a tmpdir
before requiring libs, clean up in `after()`):

- Epithet determinism: same prompt → same name; different prompts can differ;
  zh format exact-match.
- Broken transitions: hp→0 sets `broken` and emits `boss_broken` exactly once;
  hp recovery clears it without an event.
- est: CJK weighting, floor/cap bounds.
- HUD: broken line renders and survives `sanitize`.
- Recreate path: missing boss file + zh locale → zh name.

## Out of scope

More boss types, auto-kill at hp=0, haiku-namer changes, fourth tier.
