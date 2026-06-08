# AGENTS.md — read this first, then you can ship

The single onboarding doc for any coding agent or vibe-coder working on **Slime**.
Read it top to bottom and you can collaborate without breaking anything. It is
harness-neutral; `CLAUDE.md` is the Claude-Code-specific companion, and
`docs/STRUCTURE.md` is the full file-by-file map.

## What Slime is

A zero-dependency, zero-build plugin that renders a real coding session as a
turn-based RPG. Hooks observe every prompt and tool call and append battle
events to an append-only stream; three read-only consumers visualize them — a
statusline HUD, a tmux pane, and a PixiJS browser arena. Your work goals are the
bosses; your plugins are your gear.

## The prime directive (never violate)

**Observer principle.** The plugin must never change the real session. With Slime
installed, the agent's behavior must be byte-identical to without it. Therefore:

- Hooks are **fail-soft**: whole body in `try/catch`, always `process.exit(0)`,
  never block, **no LLM calls** in the hot path (the heuristic `core/estimate.js`
  exists precisely to avoid one).
- Consumers (`statusline.js`, `watch.js`, `serve.js`) are **read-only** w.r.t.
  game state. The sole exception: `serve.js` writes the `lang` preference to
  `config.json` on an explicit user click (`POST /set-lang`, 127.0.0.1-only,
  validated) — a UI preference, not game state, and it never touches Claude's
  session, so the observer principle still holds. Nothing else under `SLIME_ROOT`
  is written by a consumer.

## The other hard rules

- **Zero runtime deps, zero build.** No npm install to run; no bundler; no `.ts`
  source. TypeScript is dev-only via JSDoc + `tsc --checkJs`. The browser arena
  vendors `public/vendor/pixi.min.js` — never a CDN. `devDependencies` are fine.
- **Statusline safety.** Anything rendered to the terminal goes through
  `hud.sanitize` (strips control chars / ANSI — state files are untrusted input
  replayed every keystroke). Arena DOM uses `textContent`/`escHtml`, never
  `innerHTML`.
- **Flash safety.** Arena flashes are capped ≤3/sec by the sequencer governor;
  `?calm=1` and `prefers-reduced-motion` must keep degrading new effects.
- **Determinism / replay-stability.** State is replayed from the event stream and
  polled every keystroke. Do not use `Math.random()` in render or hook hot paths —
  derive "randomness" from an event index/hash (see `mapper`'s `hash`) so output
  is stable across replays. Money/XP/unlocks are persisted once, never re-derived.
- **i18n.** User-facing strings live in `data/locales/{en,zh}.json` (flat
  key→string; `locale.t` falls back to en). Add **both** languages for every new
  key. Player resource is **Token** (boss HP keeps "HP").
- **Test isolation.** Every test sets `process.env.SLIME_ROOT` to a tmpdir
  *before* requiring libs (ROOT is captured at require time) and cleans up after.

## Where things live

```
core/        harness-agnostic engine — consumes a normalized event stream + Snapshot.
             mapper, boss, progression, defeat-flow, estimate, report, usage, state,
             safe-io, hud, locale, arena-status, update-check, sage; types.d.ts holds
             the shared shapes.
scripts/     entry points: hook-*.js (writers), statusline.js / watch.js / serve.js
             (readers), and command-backed achievements/battlelog/milestones/wrapped/namer.
public/      the PixiJS arena (index.html, arena.js, sequencer.js, minions.js, vendor/).
data/        config.default.json, tips, locales/{en,zh}.json (+ future badges/loot).
hooks/       hooks.json — wires Claude Code lifecycle events → scripts/hook-*.js.
commands/    one *.md per slash command.
test/        node:test suite, one *.test.js per module.
docs/superpowers/  specs/ (designs) and plans/ (dated implementation plans).
```

All game state flows through one dir, `SLIME_ROOT` (default `~/.claude/slime`,
overridable via env — tests rely on this): `sessions/<id>.jsonl` (append-only
event stream, the source of truth), `sessions/<id>.json` (live Snapshot),
`profile.json`, `usage.json`, `reports/`.

## Where it's going (in-progress architecture)

Slime is being decoupled from Claude Code so it can run on other harnesses
(Copilot CLI, Gemini CLI) and so features can be added/removed cleanly.
The plan (`docs/superpowers/specs/2026-06-08-harness-portable-architecture-design.md`):

- **core/** — done: the engine moved here, consuming normalized contracts.
- **adapters/`<harness>`/** — each harness implements the `HarnessAdapter` seam
  (`parseHookEvent`/`parseStatusline`/paths/manifest) defined in `core/types.d.ts`.
- **modules/** — each feature is a folder with a `module.json` (add a feature =
  add a module; no core edit).
- **install/** — a manifest-driven installer per platform.

When you add code, put harness-agnostic logic in `core/`, keep Claude-Code-only
glue in `scripts/`/`hooks/`/`.claude-plugin/`, and surface new strings via locales.

## How to work (the loop)

1. **Design first.** Non-trivial work gets a spec in `docs/superpowers/specs/`
   (`YYYY-MM-DD-<topic>-design.md`), then a bite-sized plan in
   `docs/superpowers/plans/`. Read the relevant spec before touching its area
   (e.g. the arena-fx spec before changing arena event shapes).
2. **TDD.** Write the failing test, see it fail, implement minimally, see it pass.
3. **Verify before claiming done** — run the commands, read the output:
   ```bash
   node --test test/        # full suite — must be green
   npm run typecheck        # tsc --checkJs strict — must be clean (run npm i once for devDeps)
   ```
4. **Eyeball the arena** when you touch `public/` (it is excluded from typecheck +
   has no unit tests — verify visually):
   ```bash
   SLIME_ROOT=/tmp/slime-demo node scripts/demo-feed.js &
   SLIME_ROOT=/tmp/slime-demo SLIME_PORT=4118 node scripts/serve.js
   # open http://127.0.0.1:4118   (?calm=1 = flash-free)
   ```
5. **Commit small and often**, Conventional Commits, one logical change per commit.

## Conventions

- Work commits directly to `master` (the dev machine has a `post-commit` hook that
  refreshes the installed plugin). Source of truth is GitHub `bitqs/slime`.
- Specs/plans are dated (`YYYY-MM-DD-…`). Phases ship independently and stay green.
- Keep files focused — if one grows unwieldy, splitting it is fair game.

## Gotchas (the traps that cost real time)

- **Hook changes need a session restart.** Hooks load from the plugin cache at
  session start; editing them in the dev repo won't take effect until you restart
  Claude Code. The statusline, by contrast, re-runs its script every keystroke.
- **One arena server per port (4117).** `serve.js` reads `index.html`/static from
  *its own* `__dirname`; a stale server launched from an old/deleted plugin path
  serves `/` 404 while `/state` still works. The `/slime:arena` command only checks
  the port is occupied, not that it's healthy — kill a misbehaving server and
  restart from the current path. `serve.js` writes a liveness marker (temp dir, not
  `SLIME_ROOT`) and exits gracefully on `EADDRINUSE`.
- **`arena.js` is browser code** — excluded from `tsconfig` and untested. Changes
  are verified by driving `serve.js` + a browser, not by the suite.
- **Boss form/size = est + todos** (`encounterFormFor`/`bossTierFor` in `arena.js`):
  small task + no todos → a `mini` slime; more todos / bigger est → `pack` →
  `tentacled`. This is by design, not a bug — drive a demo with todos to see variety.

## Definition of done

Tests green, typecheck clean, arena eyeballed if `public/` changed, both locales
updated for new strings, observer principle intact (no new hot-path LLM calls,
hooks still `exit(0)`), and a focused commit. Then say it's done — with the
command output, not just an assertion.
