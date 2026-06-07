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
- All new arena effects respect `?calm=1` / `prefers-reduced-motion`
  (drain becomes instant, no pulse/shake) and the ≤3 flashes/sec governor.
  All locale keys land in both `en.json` and `zh.json`.

## 6. Plan = feeding the boss (投喂)

Planning is reframed as the player feeding the monster. The pipeline already
exists — `hook-pretool.js` emits `plan_scroll` with `est` (estimateTokens of
the plan text) and the arena stores it as `pendingEst`; this section is pure
arena presentation.

- On each `plan_scroll`: a **feeding beat** — morsel sprite arcs into the
  boss, munch wobble, and the boss **tweens toward the scale of the new
  est's tier** (no snap). A floating `+{delta}` and a live counter
  `≈{est}k tokens · {tier label}` sit under the boss while a plan is open.
  Repeated `plan_scroll` events (plan revisions) re-feed and re-grow.
- On `plan_approved`: forge flash locks the final tier (the engage-once
  guard is amended to accept this one re-lock), counter fades, label stays.
- `?calm=1` / `prefers-reduced-motion`: no wobble/arc — instant scale set
  and a static counter. Flash governor applies.

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
