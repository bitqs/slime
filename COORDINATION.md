# Session Coordination Board

Two Claude Code sessions share this working tree. Rules:

1. **Only touch files you've claimed below.** Re-read this file before claiming more.
2. **`git add` explicit paths only** — never `-A`/`.` (the index is shared; you'd commit the other session's work-in-progress).
3. **Shared files** (`data/locales/*.json`): append keys only, re-read the file right before editing, run `node --test test/` after.
4. Commit small and often; update your section when scope changes; delete this file when one session remains.

## Session A — arena / wrapped / p3-web

Plan: `docs/superpowers/plans/2026-06-07-questline-p3-web.md`

Claimed:
- `scripts/serve.js`, `scripts/wrapped.js`, `scripts/watch.js`
- `public/index.html`
- `commands/arena.md`, `commands/wrapped.md`
- `test/serve.test.js`, `test/wrapped.test.js`, `test/watch.test.js`

## Session B — i18n gap closure

Plan: `docs/superpowers/plans/2026-06-07-i18n-gaps.md`

Claimed:
- `scripts/defeat.js`, `scripts/milestones.js`, `scripts/battlelog.js`
- `test/commands.test.js` (append-only), `test/locale.test.js` (append-only)
- `commands/setup.md`
- `README.md` (one switcher line), `README.zh-CN.md`
- `docs/superpowers/specs/2026-06-07-i18n-design.md`

Shared (append-only protocol): `data/locales/en.json`, `data/locales/zh.json`
