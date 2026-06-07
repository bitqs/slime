# Boss System Polish — Design

Date: 2026-06-07
Status: approved

## Goal

Polish the boss system across six areas: name variety (with compressed project
names), a "broken" (near-death) lifecycle state with auto-defeat at session
stop, est/tier calibration, a lang-loss bug fix, a minion system (todos
rendered as killable mobs with HP-drain death animations, kill feedback and a
next-step hint), a plan-as-feeding growth show, and an in-arena game guide —
plus tests for all of it. No new dependencies, no LLM calls (observer
principle holds).

## 1. Name variety (`scripts/lib/boss.js`)

Today every boss in the same cwd gets the same name: `The {Dir} {Type}` with
five regex types and a Golem fallback.

- Add a per-type **epithet pool**, en and zh, ~8 entries per type (Golem
  included). Selection is `hash(prompt) % pool.length` — deterministic,
  offline, testable. Reuse `hash` from `scripts/lib/mapper.js`.
- Name formats:
  - en: `The {Epithet} {Base} {Type}` → "The Rabid Questline Bugbear"
  - zh: `「{形容词}・{Base}」{类型}` → "「狂暴・Questline」错虫王"
- **Compressed base**: new `compressName(dir)` helper in `boss.js` —
  multi-word names (split on `-_` and spaces) become uppercase initials with
  digits kept (`my-survivor-game → MSG`, `2d-three-kindom → 2TK`); single
  words ≤10 chars keep their capitalized form (`questline → Questline`),
  longer ones truncate to 8. Boss `{Base}` uses `compressName`; the minion
  prefix (§5) reuses it.
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
- **Auto-defeat at stop**: in `hook-stop.js`, if the boss is still `broken`
  when the session stops, record the milestone (same shape `defeat.js`
  writes), append `boss_down`, and clear the boss file — no typing needed.
  The arena plays the existing victory cutscene plus a milestone toast.
  Mid-session "all done then new todos" raises hp and clears `broken`, so
  no premature kill.
- `/questline:defeat` stays as the manual early kill — works at any hp,
  with or without todos.

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

## 5. Minion system (todos as mobs) + kill feedback + next-step hint

Todos already drive boss hp; now they also appear on screen as killable mobs.

- **Events**: `hook-posttool.js` diffs the previous todo list (stored in the
  snapshot) against the new `TodoWrite` payload. Each newly `completed` item
  emits a `minion_down` QLEvent (`{ t, kind: 'minion_down', minion, text }`,
  minion = todo content, sanitized + truncated). More than 3 kills in one
  write collapse into a single "×N multi-kill" event — no spam.
- **Snapshot**: `snap.todos = [{ content, status }]` (sanitized) so consumers
  can render the full rail without re-reading hook payloads.
- **Minion naming**: minions display as `{compressName(dir)}·小兵 {n}` /
  `{compressName(dir)} mob {n}` (n = position in the todo list). The name is
  composed node-side and written into `snap.todos[].label` and the
  `minion_down` event — the arena renders it verbatim, no browser-side
  mirror of `compressName`. The todo's own content appears in the next-step
  hint and the kill line, not as the mob name.
- **Minion looks vary**: each minion picks its sprite matrix + palette from
  a small style pool via `hash(todo content)` — deterministic, so SSE
  replays and refreshes don't reshuffle. No `Math.random`.
- **Art direction — everything is a slime** (project is being renamed to
  Slime in a separate batch): the minion style pool is mini-slime variants
  (palette + tiny feature swaps: horns, drips, eyes), and each boss type
  maps to a big slime form — Bugbear = horned slime, Hydra = three-headed
  slime, Colossus = giant blocky slime, Wraith = ghost slime, Sphinx =
  scroll slime, Golem = rock slime. The zh brand is **史莱姆**, and every
  slime form gets a zh translation — `TYPES_ZH` becomes slime forms
  (错虫史莱姆 / 重构史莱姆 / 九头史莱姆 / 试炼史莱姆 / 文档史莱姆 /
  岩石史莱姆); en type names follow in the rename batch.
- **Arena minion rail**: a side rail renders the todo list — pending = dim
  lurker, in_progress = front-line engaged, completed = tombstone. Every
  minion has a mini HP bar; on `minion_down` the bar **drains to zero
  on-screen first**, then the death burst + tombstone swap plays (sequencer
  timeline: drain → slash FX → bone burst). Multi-kill drains them in quick
  succession.
- **Kill feedback**: slash + bone burst per minion kill; consecutive kills
  show a COMBO ×N big-text; the auto-defeat boss kill reuses the victory
  cutscene plus a milestone toast. HUD `lastText` gets a kill line
  (zh `✄ 斩杀:{todo}` / en `✄ slain: {todo}`), and the boss line gains a
  `⚔ {done}/{total}` counter.
- **Next-step hint**: HUD and arena show the in_progress todo's `activeForm`
  (else the first pending): `▶ 下一步:{...}` / `▶ next: {...}`. No todos and
  no boss → existing `hud.idle`.
- **Encounter forms (生成方式)** — the creature's on-stage shape derives
  from the quest's shape. Presentation-only, computed in the arena from
  (est tier, todo count), re-evaluated when todos arrive or change:

  | est tier | todos | form |
  |---|---|---|
  | normal | ≤1 | single mini slime (scale 0.5) |
  | ELITE/RAID | ≤2 | single big slime (tier scale) |
  | normal | ≥2 | slime pack — one mini slime per todo on the floor (cap 5), no big boss sprite; boss hp = pack progress |
  | ELITE/RAID | ≥3 | big slime with tentacles — one pixel tentacle per todo (cap 6); a completed todo severs one (rail drain + tentacle falls) |

  A TodoWrite after the encounter may upgrade the form (single big →
  tentacled). Kill feedback adapts per form: pack kill = that slime bursts;
  tentacle sever = falls + bone burst. Broken state grays/kneels whatever
  form is on stage.
- All new arena effects respect `?calm=1` / `prefers-reduced-motion`
  (drain becomes instant, no pulse/shake) and the ≤3 flashes/sec governor.
  All locale keys land in both `en.json` and `zh.json`.

## 6. Scene system + plan-as-feeding (投喂)

The arena gains three scenes, switched by events. Scene switching is
presentation-only — no new event kinds, no hook changes (the pipeline
already exists: `hook-pretool.js` emits `plan_scroll` with `est`,
`hook-posttool.js` emits `choice_made` and `plan_approved`).

- **FEEDING (plan scene)**: any plan-phase activity — `plan_scroll`, and
  Q&A (`choice_open`/`choice_made`) — enters the feeding scene: stage dims,
  and the creature starts as a **baby slime (mob-sized, scale ~0.5)** that
  is fed up toward boss size. Each `plan_scroll` lobs a morsel arc from the
  knight and tweens the slime's scale toward the new est tier's scale (no
  snap); each `choice_made` answer is a small morsel (+small grow toward
  the current target). A live counter `≈{est}k tokens · {tier label}` sits
  under the slime, with `+{delta}` floaters per feed. `plan_approved` →
  forge flash locks the final tier → BATTLE.
- **BATTLE (default scene)**: knight vs boss + minion rail — current
  behavior. **With no plan at all, encounters go straight to BATTLE** and
  the player fights minions directly; feeding never shows.
- **SETTLEMENT (results scene)**: on `turn_end`, a brief dimmed results
  card (rank/dmg/kills, ~2s) then back to BATTLE; on `boss_down`, the
  victory cutscene + milestone toast IS the settlement, returning to BATTLE
  (or idle when no boss remains).
- `?calm=1` / `prefers-reduced-motion`: no wobble/arc/pulse — instant scale
  set and a static counter. Flash governor applies throughout.

## 7. Game guide (游戏说明)

New players (and the public demo) get no explanation of the metaphor today.

- **Arena help overlay**: a `?` button (and `h` key) toggles a bilingual
  guide overlay — what the boss is (your current quest), HP (todo progress),
  minions (todos), Token (your resource), combo, broken/auto-defeat, and the
  slash commands (`/questline:arena`, `/defeat`, `/milestones`, `/wrapped`).
  Rendered with `textContent`/`escHtml` like every overlay; closes on `Esc`
  or click-outside, same pattern as existing overlays. Demo worker serves it
  unchanged (static content, no new endpoints).
- **README**: a short "How to read the battle" legend section linking the
  same concepts.
- Guide copy lives in `data/locales/{en,zh}.json` keys.

## Testing

`node --test test/` (existing isolation pattern: set `CCQ_ROOT` to a tmpdir
before requiring libs, clean up in `after()`):

- Epithet determinism: same prompt → same name; different prompts can differ;
  zh format exact-match.
- Broken transitions: hp→0 sets `broken` and emits `boss_broken` exactly once;
  hp recovery clears it without an event.
- Auto-defeat: stop while broken → milestone recorded, `boss_down` appended,
  boss file cleared; stop while not broken → nothing.
- Minion diff: newly completed todos emit `minion_down` per item; >3 in one
  write collapses to one multi-kill event; unchanged/pending items emit
  nothing; `snap.todos` updated and sanitized.
- Next-step hint: in_progress beats pending; empty list falls back to idle.
- `compressName`: multi-word → initials with digits (`my-survivor-game →
  MSG`, `2d-three-kindom → 2TK`); short single word keeps capitalized form;
  long single word truncates to 8.
- Minion labels: node-side composition (`{abbrev}·小兵 {n}` / en variant),
  sanitized; style pick from `hash(content)` is stable across calls.
- est: CJK weighting, floor/cap bounds.
- HUD: broken line renders and survives `sanitize`.
- Recreate path: missing boss file + zh locale → zh name.

## Out of scope

More boss types, auto-kill at hp=0, haiku-namer changes, fourth tier.
