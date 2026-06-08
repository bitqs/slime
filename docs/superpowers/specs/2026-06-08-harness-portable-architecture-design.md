# Harness-Portable Architecture — Design Spec

**Date:** 2026-06-08
**Status:** Approved direction (Option A: core + adapters + module registry)

## Problem

Slime is welded to Claude Code. Nine coupling points bind the codebase to one
harness, so adding another AI harness (Copilot CLI, Gemini CLI, Codex), adding or
removing a feature, or producing a multi-platform installer all mean editing
core game logic. We want an architecture that is **Vibe-Coding friendly**: add a
harness = add one adapter; add a feature = add one module; nothing in the core
changes.

### The nine coupling points (from the search)

| Coupling | Location |
|---|---|
| Hook event names + `CLAUDE_PLUGIN_ROOT` | `hooks/hooks.json` |
| Hook payload fields (`session_id`, `tool_name`, `tool_input`, `tool_response`, `cwd`, `prompt`, `source`) | 7× `scripts/hook-*.js` |
| Statusline stdin schema (`model`, `context_window`, `rate_limits`, `cost`) | `scripts/statusline.js`, `scripts/lib/usage.js` |
| `CLAUDE_CONFIG_DIR`, state dir `~/.claude/slime` | `scripts/lib/state.js` |
| Plugin manifest | `.claude-plugin/` |
| Slash-command format | `commands/*.md` |
| Spawns `claude -p` CLI | `scripts/namer.js:21` |
| Reads `~/.claude/settings.json` | `scripts/lib/update-check.js` |

### Already harness-agnostic (the core — most of the codebase)

`mapper, boss, estimate, report, hud, locale, usage, state, arena-status,
safe-io` plus the entire `public/` arena. They already consume only a normalized
`SlimeEvent` stream and a `Snapshot`. Event normalization is therefore the single
natural seam.

## Goals

- **One seam.** Core depends only on normalized contracts, never on a harness.
- **Add-a-harness = add-an-adapter.** No core edits.
- **Add-a-feature = add-a-module.** Self-contained, declared via a manifest.
- **Multi-platform install** driven by adapter + module manifests.
- **Preserve the hard rules**: zero build, zero runtime deps, observer principle
  (fail-soft hooks, always exit 0, no LLM calls in the hot path), statusline/flash
  safety, test isolation via `SLIME_ROOT`.

## Non-goals

- No monorepo / npm packages / bundler (violates zero-build/zero-dep).
- No behavior change. This is a structural refactor; the Claude Code experience
  must stay byte-identical. (Numeric arena tuning is tracked separately.)
- Not building the Copilot/Gemini/Codex adapters now — only proving the seam so
  they become a small, additive task.

## Architecture

```
slime/
├── core/                     harness-agnostic engine (consumes normalized contracts)
│   ├── engine/               mapper, boss, estimate, report, usage, state, safe-io
│   ├── render/               hud, locale, arena-status
│   └── contracts.d.ts        SlimeEvent / Snapshot / HookContext / StatuslineCtx / HarnessAdapter
├── adapters/                 one folder per harness — implements HarnessAdapter
│   └── claude-code/          payload parse + statusline parse + path/env + namer spawn
│       ├── adapter.js
│       ├── manifest.json     events, statusline command, commands, install targets
│       └── fixtures/         sample raw payloads for contract tests
├── modules/                  add/remove features here; each declares a module.json
│   ├── statusline-hud/
│   ├── web-arena/            serve.js + public served assets reference
│   ├── tmux-watch/
│   ├── wrapped/
│   ├── milestones/
│   └── namer/
├── public/                   arena frontend (already harness-agnostic)
├── install/                  installer: reads adapter + enabled module manifests →
│                             emits the harness-native config (see Install below)
├── hooks/hooks.json          CC-required entrypoint — thin, calls adapter dispatch
├── .claude-plugin/           CC-required manifest — stays at root, points into adapters/
└── test/                     suite stays green every phase; + adapter contract tests
```

### The seam: contracts

Two normalized inputs flow from any harness into the core; one rendered string
flows back out.

```ts
// what a harness hands the engine, regardless of its native payload shape
interface HookContext {
  event: 'session_start' | 'prompt' | 'pre_tool' | 'post_tool'
       | 'stop' | 'subagent_stop' | 'pre_compact';
  sessionId: string;
  cwd?: string;
  prompt?: string;          // prompt event
  tool?: string;            // pre/post_tool
  toolInput?: unknown;      // pre_tool
  toolResponse?: unknown;   // post_tool
  source?: string;          // session_start
}

// what a harness hands the statusline renderer
interface StatuslineCtx {
  sessionId?: string;
  model?: string;
  contextPct?: number;
  costUsd?: number;
  rateLimits?: { fiveHour?: RateWindow; sevenDay?: RateWindow };
}

interface HarnessAdapter {
  resolveStateRoot(): string;                  // where SlimeEvent/Snapshot live
  resolveConfigDir(): string;                  // for update-check etc.
  parseHookEvent(raw: unknown, event: string): HookContext | null;
  parseStatusline(raw: unknown): StatuslineCtx;
  spawnNamer(prompt: string): void;            // background namer; no-op allowed
  manifest: AdapterManifest;
}
```

The core exposes two pure entry functions consumed by adapters:

- `core/engine/ingest(ctx: HookContext)` — the merged successor to the seven
  `hook-*.js` bodies; updates the event stream + snapshot via `state`/`safe-io`.
- `core/render/statusline(ctx, snapshot, tips, now, usage, lang, live)` — today's
  `hud.render`, unchanged.

### Claude Code adapter — handling CC's required file locations

Claude Code requires `hooks/hooks.json` and `.claude-plugin/` at the plugin root;
those cannot move. Resolution: **keep the CC-mandated files at root, but make
them thin.** Each `hooks.json` command invokes one dispatch entrypoint with an
`--event` flag; the entrypoint asks the CC adapter to `parseHookEvent` then calls
`core.ingest`. So the *adapter logic* lives in `adapters/claude-code/`, while the
handful of files CC's loader insists on stay at root pointing into it.

```
hooks/hooks.json  ──▶  node dispatch.js --event pre_tool
dispatch.js       ──▶  adapter.parseHookEvent(stdin, 'pre_tool') ──▶ core.ingest(ctx)
```

### Module manifest (decision: explicit `module.json`)

Each feature is a folder under `modules/` with a `module.json`. Explicit manifests
(over convention-only discovery) win because the installer needs machine-readable
declarations and a contributor can see a module's contract at a glance.

```json
{
  "name": "web-arena",
  "description": "PixiJS browser battle viewer",
  "entry": "serve.js",
  "needs": ["events", "snapshot"],
  "provides": { "command": "arena", "statuslineLink": true },
  "default": true
}
```

Toggling a module = flipping `default`/an enabled-list; the installer includes or
omits its command + entrypoint accordingly. Core has no knowledge of any module.

### Install layer

`install/` contains one builder per target. A builder reads the chosen adapter's
`manifest.json` + the enabled `modules/*/module.json` and emits the harness-native
config — for Claude Code: the `.claude-plugin/` manifest, `hooks/hooks.json`
entries, and the statusline command. Future harnesses get their own builder; the
module set is reused unchanged.

## Data flow (one turn, with the adapter)

1. Harness fires its native hook → its `hooks.json` entry runs `dispatch.js --event …`.
2. `dispatch.js` calls `adapter.parseHookEvent(rawStdin, event)` → `HookContext`.
3. `core.ingest(ctx)` maps tool→verb (`mapper`), updates boss/combo/kills, appends
   the `SlimeEvent`, writes the `Snapshot` via `state`+`safe-io`.
4. Consumers (modules) read independently: `statusline-hud`, `web-arena` (SSE),
   `tmux-watch` — all already snapshot/stream readers.

## Migration phases (each ends with `node --test test/` + `npm run typecheck` green)

- **P1 — contracts + core move.** Add `core/contracts.d.ts`. Move harness-agnostic
  libs into `core/engine` + `core/render`; fix `require` paths. Pure relocation.
- **P2 — Claude Code adapter.** Extract payload/statusline parsing + path/env +
  namer spawn into `adapters/claude-code/`. Add `dispatch.js`; collapse the seven
  `hook-*.js` bodies into `core.ingest`, leaving thin shims (or a single dispatch).
  Add contract tests using `adapters/claude-code/fixtures/`.
- **P3 — modularize features.** Move `serve.js`, `watch.js`, `wrapped.js`,
  `milestones.js`, `namer.js`, statusline into `modules/*` with `module.json`.
- **P4 — install layer.** Build the CC installer that regenerates `.claude-plugin`
  + `hooks.json` + statusline command from manifests. Verify a clean install
  matches today's behavior.
- **P5 (future, out of this spec) — second adapter** (Copilot or Gemini) to prove
  the seam is real.

## Testing strategy

- Keep the full `node --test test/` suite green at every phase boundary — it is the
  regression net for "no behavior change."
- Preserve test isolation: set `process.env.SLIME_ROOT` to a tmpdir before
  requiring core libs (ROOT is captured at require time).
- New **adapter contract tests**: feed recorded raw Claude Code payloads from
  `fixtures/` through `parseHookEvent`/`parseStatusline`, assert the normalized
  `HookContext`/`StatuslineCtx`. This is what guarantees a future adapter conforms.
- `arena.js` stays browser-verified (PIXI closure, no unit tests) — drive `serve.js`
  with demo snapshots + a browser as we do today.

## Risks & mitigations

- **`require` path churn across many files.** Mitigate: move in small phases, run
  tests after each; rely on `tsc --checkJs` to catch broken imports.
- **CC loader expects fixed file locations.** Mitigate: keep CC-mandated files at
  root as thin shims (see adapter section); never relocate `hooks/hooks.json` or
  `.claude-plugin/` themselves.
- **Local `post-commit` hook refreshes the installed plugin** assuming current
  layout. Mitigate: update it in P4 alongside the installer.
- **Scope creep into behavior changes.** Mitigate: non-goal is explicit; numeric
  tuning and any gameplay change ride separate commits.

## Open decisions (resolved)

- Module registration → **explicit `module.json`** (not convention-only).
- Hook entrypoints → **single `dispatch.js --event`** rather than seven scripts,
  to shrink the CC-required surface. (Revisit in P2 if CC timeout/cold-start cost
  favors per-event scripts.)
