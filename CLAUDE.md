# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Questline — a Claude Code plugin that renders your real work as a turn-based RPG: hooks observe every tool call and write battle events; a statusline HUD, a tmux pane, and a PixiJS web arena visualize them. Published as marketplace `bitqs/questline`; users run it straight from the git clone — **no build step, no npm install, zero runtime dependencies** (devDependencies are fine; the browser arena uses a vendored `public/vendor/pixi.min.js`, never a CDN).

## Commands

```bash
node --test test/                  # full suite
node --test test/hud.test.js      # one file
npm run typecheck                  # tsc --checkJs strict (needs `npm install` once for devDeps)

# Eyeball the arena without a real session:
CCQ_ROOT=/tmp/ccq-demo node scripts/demo-feed.js &
CCQ_ROOT=/tmp/ccq-demo QL_PORT=4118 node scripts/serve.js
# open http://127.0.0.1:4118  (?calm=1 = flash-free)

# Public demo worker (Cloudflare):
cd demo && npx wrangler deploy    # → questline-arena-demo.shuangqu.workers.dev
```

## Architecture

Everything flows through one state directory, `CCQ_ROOT` (default `~/.claude/ccq`, overridable via env — tests rely on this):

```
hooks (hooks/hooks.json → scripts/hook-*.js)          WRITERS, fire on every prompt/tool call
  └→ sessions/<id>.jsonl   append-only QLEvent stream (cast/resolve/encounter/turn_end/
     sessions/<id>.json    live Snapshot               boss_down/choice_open/choice_made/
     profile.json, usage.json, boss state per-project  plan_scroll/plan_approved/potion…)

consumers                                              READERS, never write game state
  ├ scripts/statusline.js  one-line HUD (scripts/lib/hud.js), runs on every keystroke
  ├ scripts/watch.js       tmux top-pane live monitor
  └ scripts/serve.js       local HTTP: / (public/index.html) + /state + /events (SSE tail
                           of the jsonl) + exact-match static whitelist (arena.js,
                           sequencer.js, vendor/pixi.min.js — never path-derived fs reads)
```

- `scripts/lib/` is the shared layer; `scripts/lib/types.d.ts` holds the central JSDoc shapes (Snapshot, UsageCache, QLEvent…). All state IO goes through `scripts/lib/safe-io.js` (atomic writes, tolerant reads).
- `public/arena.js` is the PixiJS arena: SSE events → FX primitives (`PRIM`); cutscenes are declarative `{at, do}` timelines played by `public/sequencer.js` (UMD — unit-tested in node, loaded as `QLSeq` in the browser). Extension point: `window.QLArena.on(handler)`.
- `demo/` is a self-contained Cloudflare Worker serving `../public` verbatim plus a synthetic `/state` + `/events` show. It is excluded from tsconfig.

## Hard rules

- **Observer principle**: the plugin must never affect the real session. Hooks are fail-soft — whole body in try/catch, always `process.exit(0)`, never block, no LLM calls (the heuristic `scripts/lib/estimate.js` exists precisely to avoid one). Claude's behavior with the plugin installed must stay byte-identical to without.
- **Statusline safety**: anything rendered to the terminal goes through `hud.sanitize` (strips control chars/ANSI — state files are untrusted input replayed on every keystroke). Anything event-derived rendered in the arena DOM goes through `textContent`/`escHtml`, never `innerHTML`.
- **Flash safety**: arena flashes are capped ≤3/sec by the sequencer governor; `?calm=1` and `prefers-reduced-motion` must keep degrading new effects (flash→fade, shake/chroma/hitstop off).
- **i18n**: user-facing strings live in `data/locales/{en,zh}.json` (flat key→string, `locale.t` falls back to en). Player resource is named **Token** (boss HP keeps "HP"). When adding keys, add both languages.
- **Test isolation**: every test file sets `process.env.CCQ_ROOT` to a tmpdir *before* requiring libs (ROOT is captured at require time) and cleans up in `after()`. Copy that pattern; hud/sage tests once leaked the user's real locale by skipping it.

## Conventions

- Specs in `docs/superpowers/specs/`, plans in `docs/superpowers/plans/` (dated, superpowers workflow). Read the arena-fx spec before touching arena/hook event shapes.
- A local `.git/hooks/post-commit` (dev machine only, not in repo) refreshes the installed plugin after every commit; restart the Claude Code session to load changed hooks.
- TypeScript is dev-only: JSDoc annotations checked by `tsc --noEmit --checkJs` (strict). Do not introduce `.ts` source or a build step. `public/arena.js` is currently excluded from checking (browser globals + vendored PIXI).
