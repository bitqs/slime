# Questline P3-Web + Wrapped Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Local pixel-art battle viewer (server + page) and Weekly Wrapped card.

**Iron rules:** read-only over `~/.claude/ccq` (server never writes game state), zero npm deps, localhost only (bind 127.0.0.1), all 62 tests stay green.

### Task 1: `scripts/serve.js` — local viewer server

- `node:http` server, bind `127.0.0.1`, port `process.env.QL_PORT || 4117`
- Routes:
  - `GET /` → serves `public/index.html` (path resolved from `__dirname/../public`)
  - `GET /state` → JSON `{ snapshot, usage, lang }` of newest session (mtime scan like watch.js)
  - `GET /events` → SSE (`text/event-stream`); every 1s, if newest session's .jsonl grew, send each NEW line as `data: <json>\n\n`; track byte offset per connection; heartbeat comment every 15s
- Export `createServer()` for tests (listen only under `require.main === module`)
- Tests (node:test + fetch against ephemeral port): `/state` returns JSON with snapshot field; `/` returns HTML; unknown path → 404
- Commit: `feat: serve.js — local battle viewer server (SSE)`

### Task 2: `public/index.html` — pixel battle scene

Single self-contained file (inline CSS+JS, no CDN, no build). Art direction: dark dungeon, chunky 8-bit pixels (image-rendering: pixelated; canvas scaled), CRT scanline overlay, gold/ember accent on dark slate.

- Layout: top bar (boss name + segmented HP bar; player ⚡HP %), center canvas battle stage, bottom battle log (last 6 events, typewriter append)
- Sprites: tiny pixel knight (player) left, boss blob right — draw programmatically on canvas (no image assets): idle bob animation
- Event reactions (from SSE):
  - `cast` → knight lunge animation + event text to log
  - `resolve` with dmg → floating damage number over boss, screen-shake 100ms, combo counter pop
  - `resolve` with kill → skull burst particles
  - `resolve` with hit → red flash + combo reset
  - `turn_end` → banner "TURN COMPLETE — RANK X" 2s overlay
  - `encounter` → boss name slide-in
- Poll `/state` every 5s for HP bars; zh strings come through event text already (no client i18n needed)
- No tests (visual); manual check via `node scripts/serve.js` + open browser
- Commit: `feat: pixel battle arena — public/index.html`

### Task 3: `/questline:arena` command + README

- `commands/arena.md`: instruct Claude to run `node "${CLAUDE_PLUGIN_ROOT}/scripts/serve.js" &` (background) then tell user to open http://127.0.0.1:4117
- README: "Pixel Arena" section with screenshot placeholder
- Commit: `feat: /questline:arena command`

### Task 4: Weekly Wrapped

- `scripts/wrapped.js`: scan `<ROOT>/sessions/*.jsonl` events with `t` in last 7 days → totals {turns(turn_end), dmg, kills, hits, maxCombo, potions, summons, activeDays(set of dates), topGear(profile.gearUse top 3)} + milestones this week (profile.milestones date in range)
- Render shareable ASCII card (locale-aware via locale.t — add catalog keys), ~12 lines, box-drawing frame:

```
╔══════════════════════════════════╗
║  ⚔️ QUESTLINE WRAPPED · week 23   ║
║  …                                ║
╚══════════════════════════════════╝
```

- `commands/wrapped.md` runs it verbatim
- Tests: seed fixture events across dates, assert totals + card contains key numbers; old events (>7d) excluded
- Commit: `feat: weekly wrapped card`
