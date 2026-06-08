# Slime — Project Structure

A map of every directory and file, what each part does, and how data flows
between them. For the design philosophy and hard rules, see `../CLAUDE.md`.

## What Slime is

A zero-dependency, zero-build Claude Code **plugin** that renders your real
coding session as a turn-based RPG. Hooks observe every prompt and tool call and
append battle events; three consumers (a statusline HUD, a tmux pane, and a
browser arena) visualize them. The plugin is a pure **observer** — it never
changes Claude's behavior and never blocks the session.

```
Claude Code session
   │  (prompts, tool calls)
   ▼
hooks  ──writes──▶  SLIME_ROOT state dir  ──reads──▶  consumers (HUD / tmux / web arena)
```

## Top-level layout

```
slime/
├── .claude-plugin/      plugin + marketplace manifests (how Claude Code loads it)
├── hooks/               hooks.json — wires session events → scripts/hook-*.js
├── scripts/             all Node entrypoints (hook-*.js + command-backed)
├── core/                shared engine modules; types.d.ts holds central JSDoc shapes
├── commands/            slash-command definitions (*.md) → invoke scripts/*
├── public/              browser arena (PixiJS) — served by scripts/serve.js
├── data/                static config, tips, and i18n locale catalogs
├── demo/                self-contained Cloudflare Worker public demo
├── docs/                specs, plans (superpowers workflow), and this file
├── test/                node:test suite (one *.test.js per module)
├── CLAUDE.md            design philosophy + hard rules (read before editing)
├── README.md            user-facing intro
├── package.json         scripts + devDeps only (zero runtime deps)
└── tsconfig.json        tsc --checkJs strict config (JSDoc type-checking)
```

## The one state directory

Everything flows through `SLIME_ROOT` (default `~/.claude/slime`, overridable via
the `SLIME_ROOT` env var — tests rely on this). Hooks are the only writers; every
consumer is read-only.

```
$SLIME_ROOT/
├── sessions/<id>.jsonl   append-only SlimeEvent stream (the source of truth)
├── sessions/<id>.json    live Snapshot (latest derived game state)
├── profile.json          cross-session player profile (level, milestones)
├── usage.json            token-usage cache (drives HP% and rest banners)
└── reports/<id>.txt      rendered turn reports
```

Event types in the `.jsonl` stream: `cast`, `resolve`, `encounter`, `turn_end`,
`boss_down`, `boss_broken`, `ultimate`, `minion_down`, `summon_back`,
`choice_open`, `choice_made`, `plan_scroll`, `plan_approved`, `potion`,
`level_up`, … (Phase 3-5 will add `badge_unlocked`, `quest_done`, `loot_drop`).

## `hooks/` — the writers

`hooks.json` registers one script per Claude Code lifecycle event. Each runs with
a **2-second timeout**, is wrapped entirely in try/catch, and always exits 0 — a
crash or slowness here must never affect the real session.

| Hook event       | Script                     | Role |
|------------------|----------------------------|------|
| `SessionStart`   | `hook-sessionstart.js`     | Open the session, emit "what's new", seed snapshot |
| `UserPromptSubmit` | `hook-prompt.js`         | Start a turn / open an encounter from the prompt |
| `PreToolUse`     | `hook-pretool.js`          | Map an imminent tool call → a `cast` event |
| `PostToolUse`    | `hook-posttool.js`         | Resolve the cast → damage, combo, kills |
| `Stop`           | `hook-stop.js`             | Close the turn, write the turn report |
| `SubagentStop`   | `hook-subagentstop.js`     | Account for subagent ("summon") turns |
| `PreCompact`     | `hook-precompact.js`       | Snapshot/flush before context compaction |

## `scripts/` — entrypoints

### Consumers (readers — never write game state)

| File             | Role |
|------------------|------|
| `statusline.js`  | One-line HUD, runs on every keystroke. Reads snapshot + usage, renders via `core/hud.js`. Shows the clickable `[HUD]` arena link when an arena is live (see `core/arena-status.js`). |
| `watch.js`       | tmux top-pane live battle monitor. |
| `serve.js`       | Local HTTP server for the web arena: `/` (index.html), `/state` (JSON), `/events` (SSE tail of the jsonl), and an exact-match static whitelist. Writes a liveness/port marker on listen, clears it on exit, and exits gracefully if the port is already owned by a live arena. |

### Command-backed scripts

Invoked by the matching `commands/*.md` slash command:

| File             | Command          | Role |
|------------------|------------------|------|
| `achievements.js`| `/achievements`  | Level, title & badge grid |
| `battlelog.js`   | `/battlelog`     | This session's turn reports |
| `milestones.js`  | `/milestones`    | The Milestone Wall |
| `wrapped.js`     | `/wrapped`       | Weekly Wrapped stats (last 7 days) |
| `defeat.js`      | — (legacy)       | Manual kill+reward CLI. Kills now auto-confirm at Stop via `core/defeat-flow.js`; no slash command points here anymore. |
| `namer.js`       | —                | Detached async boss namer (hooks can't wait on the 2s cap, so naming runs out-of-band) |
| `demo-feed.js`   | —                | Synthesize a fake session to eyeball the arena without real work |

## `core/` — shared engine layer

`types.d.ts` holds the central JSDoc shapes (`Snapshot`, `UsageCache`,
`SlimeEvent`, `BossState`, `Profile`, …) imported across the codebase.

| Module            | Role |
|-------------------|------|
| `safe-io.js`      | The single IO gateway: atomic writes (temp+rename, 0600), tolerant reads, symlink refusal. Every function silent-fails. |
| `state.js`        | Reads/writes the `SLIME_ROOT` files: snapshots, the event stream, profile. Owns `ROOT` and path helpers. |
| `mapper.js`       | Maps a tool call → a `SlimeEvent` (verb table: which tools are which "spells"). |
| `boss.js`         | Boss state + naming (regex name table) per project; `recordDefeat` awards XP/badges. |
| `progression.js`  | Pure XP/level/title/badge engine: `xpForDefeat`, `levelFor`, `deriveStats`, `evaluateBadges`. |
| `defeat-flow.js`  | Shared post-kill reward text + events (`rewardLines`, `emitRewards`), used by the Stop hook, the auto-down path, and `defeat.js`. |
| `usage.js`        | Token-usage cache → HP%, rest time. Relays official statusline fields to hooks. |
| `estimate.js`     | Gamified token-cost heuristic (deliberately NOT a real estimator — avoids any LLM call). |
| `report.js`       | Turn-report aggregate + progress-bar (`bar()`) rendering. |
| `hud.js`          | Composes the one-line statusline string. Owns `sanitize` (strips control chars/ANSI) and `uiLink` (the live, port-aware `[HUD]` hyperlink). |
| `sage.js`         | Context-aware tips/advice from usage + boss HP. |
| `locale.js`       | i18n: loads `data/locales/{en,zh}.json`, `t`/`fmt` with en fallback. |
| `arena-status.js` | Arena liveness + port marker shared by `serve.js` (writer) and `statusline.js` (reader). Marker lives in the OS temp dir, **not** under `SLIME_ROOT`, so `serve.js` stays read-only w.r.t. game state. |
| `update-check.js` | Session-start "what's new" for directory-sourced installs. |

## `public/` — the web arena

Served verbatim by `serve.js`; consumes `/state` + `/events`. No build step; PIXI
is vendored, never a CDN.

| File                  | Role |
|-----------------------|------|
| `index.html`          | Arena page shell. |
| `arena.js`            | PixiJS arena: SSE events → FX primitives (`PRIM`). Extension point: `window.SlimeArena.on(handler)`. |
| `sequencer.js`        | UMD cutscene engine: declarative `{at, do}` timelines (`SlimeSeq` in browser, unit-tested in node). Enforces the ≤3 flashes/sec governor. |
| `minions.js`          | Renders `snap.todos` as a rail of mini slimes. Pure DOM consumer. |
| `vendor/pixi.min.js`  | Vendored PixiJS (offline, no CDN). |

## `data/`, `commands/`, `demo/`

- **`data/`** — `config.default.json`, `tips.json` / `tips.zh.json`, and
  `locales/{en,zh}.json` (flat key→string; add both languages when adding keys).
- **`commands/`** — one `*.md` per slash command (`arena`, `achievements`,
  `battlelog`, `milestones`, `setup`, `update`, `wrapped`). `arena.md` starts
  `serve.js` in the background if not already running and prints the URL.
- **`demo/`** — a self-contained Cloudflare Worker (`worker.js`) serving `../public`
  plus a synthetic `/state` + `/events` show. Excluded from tsconfig.
  Deploy: `cd demo && npx wrangler deploy`.

## Data-flow lifecycle (one turn)

1. **Prompt** → `hook-prompt.js` opens a turn / encounter, appends an event.
2. **Each tool call** → `hook-pretool.js` writes a `cast`; `hook-posttool.js`
   writes a `resolve` (damage, combo, kills). `mapper.js` decides the verb.
3. Every write updates `sessions/<id>.json` (the live Snapshot) via `state.js` +
   `safe-io.js`.
4. **Consumers** poll/tail independently:
   - `statusline.js` re-renders on every keystroke (snapshot + usage → `hud.js`);
     shows the `【UI】` link when `arena-status.readLive()` finds a live arena.
   - `serve.js` tails the `.jsonl` and pushes new lines to the browser over SSE.
   - `watch.js` repaints the tmux pane.
5. **Stop** → `hook-stop.js` closes the turn and writes `reports/<id>.txt`.

## Invariants (enforced by `CLAUDE.md` + tests)

- **Observer**: hooks fail-soft, always exit 0, never block, no LLM calls.
- **Statusline safety**: terminal output goes through `hud.sanitize`; arena DOM
  uses `textContent`/`escHtml`, never `innerHTML`.
- **Flash safety**: arena flashes capped ≤3/sec; `?calm=1` and
  `prefers-reduced-motion` degrade effects.
- **Read-only consumers**: `statusline.js`, `watch.js`, `serve.js` never write
  game state. (`serve.js`'s liveness marker lives outside `SLIME_ROOT`.)
- **Test isolation**: every test sets `process.env.SLIME_ROOT` to a tmpdir before
  requiring libs (ROOT is captured at require time) and cleans up after.

## Dev commands

```bash
node --test test/                 # full suite
node --test test/hud.test.js      # one file
npm run typecheck                 # tsc --checkJs strict (run `npm install` once for devDeps)

# Eyeball the arena without a real session:
SLIME_ROOT=/tmp/slime-demo node scripts/demo-feed.js &
SLIME_ROOT=/tmp/slime-demo SLIME_PORT=4118 node scripts/serve.js
# open http://127.0.0.1:4118  (?calm=1 = flash-free)
```
