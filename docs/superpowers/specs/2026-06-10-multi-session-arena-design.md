# Multi-session arena — session picker (B3)

**Date:** 2026-06-10
**Status:** Implemented (verified live via playwright — pin, reload, auto-follow, zh relabel)
**Scope:** `core/state.js`, `scripts/serve.js`, `public/index.html`, `public/arena.js`, `test/serve.test.js`

## Problem

Hooks already write every session's state side by side under
`SLIME_ROOT/sessions/<id>.json` (snapshot) + `<id>.jsonl` (events) — multiple
terminals coexist fine at the data layer. But the viewer is hard-bound to
`newestSessionId()`: `/state` reads it, and `/events` *jumps* to any newer
session mid-stream (serve.js "Check for a newer session"). With two terminals
working, the arena flips between battles on every write race.

## Approach (chosen: A)

Channel picker + per-viewer URL pin. The server stays stateless; each browser
tab can watch a different battle; no game state is written (observer principle
holds).

Rejected: B server-side global channel (forces all tabs in sync, adds a write);
C split-screen all sessions (big arena render rework — YAGNI until asked).

## Server

### `core/state.js` — `listSessions()`

Scan `ROOT/sessions/*.json`, stat mtime, tolerant-read each snapshot.
Return newest-first, capped at 12:

```js
{ id, project,          // basename of snapshot.cwd (raw, viewer escapes)
  boss,                 // snapshot.boss?.name || null
  turn,                 // snapshot.turn || 0
  updated,              // file mtimeMs
  active }              // mtimeMs within ACTIVE_MS (10 min)
```

Unreadable snapshot → skip the entry (fail-soft, same spirit as
`newestSessionId`).

### `scripts/serve.js`

- New route `GET /sessions` → `{ sessions: listSessions(), newest: newestSessionId() }`.
- `/state?session=<id>` and `/events?session=<id>`:
  - id must match `SESSION_ID_RE = /^[A-Za-z0-9_-]{1,64}$/` — the regex is the
    whole guard (no slashes/dots → traversal structurally impossible, same
    pattern as `AUDIO_RE`). Invalid id → ignored, fall back to newest
    (fail-soft, no 4xx — the viewer never breaks).
  - Pinned `/events` does **not** auto-jump to newer sessions; it keeps
    tailing the pinned jsonl. File missing/not-yet-created → poll waits
    silently.
  - No param → behavior unchanged (follow newest, auto-jump).

## Viewer

`public/index.html`: `<select id="session-picker">` in the top bar, hidden by
default.

`public/arena.js`:

- On boot read `?session=` from `location.search` → pin state.
- Fetch `/sessions` on boot + every 10 s. Fetch error or non-200 → hide
  picker entirely (the public demo worker has no `/sessions`; the demo must
  not break).
- Picker is visible **only when ≥2 sessions are active** OR a pin is set
  (single-terminal users see zero new chrome).
- Options: `📡 auto-follow` (default, no param) + one option per session:
  `{project} · {boss} (turn N)`, inactive ones greyed with a ⏸ prefix.
  All session-derived text set via `textContent` / option.text — never
  innerHTML.
- Selecting a session: `history.replaceState` writes `?session=<id>`,
  EventSource is closed and reopened with the param, `/state?session=` is
  refetched and re-applied. Selecting auto-follow removes the param and
  reconnects bare.
- Refresh / shared URL keeps the pin (pin lives in the URL, not storage).
- i18n: picker labels/tooltips go in the `UI` catalog, en + zh.

## What does NOT change

- Hooks and the event/snapshot formats — untouched.
- Default (no-param) viewer behavior — byte-identical.
- `demo/` worker — untouched; the picker hides itself when `/sessions` is
  absent.
- statusline / watch.js — single-session by nature, out of scope.

## Testing (`test/serve.test.js` additions)

Tmp `SLIME_ROOT` with two fake sessions (older A, newer B):

1. `/sessions` lists both, newest first, with project/boss/active fields.
2. `/state?session=A` returns A's snapshot while B is newer.
3. Invalid id (`../x`, 65+ chars) → falls back to newest, 200.
4. Pinned `/events?session=A` keeps streaming A after B's jsonl grows
   (no auto-jump); unpinned `/events` still jumps.

Manual: two real terminals + arena, switch channels mid-battle; demo worker
page still loads with no picker.
