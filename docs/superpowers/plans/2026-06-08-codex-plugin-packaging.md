# Codex Plugin Packaging — Slim Runtime Plan

**Goal:** Ship Slime as a Codex plugin without making the entire development
repository part of the plugin payload. Current repo-root plugin evaluation scores
`deferred_cost_tokens` at ~320k, mostly from `public/vendor/pixi.min.js`, old
plans/specs, tests, and docs. Active invoke cost is acceptable; packaging shape
is the issue.

## Current State

- Codex plugin metadata lives at `.codex-plugin/plugin.json`.
- Codex hooks live at root `hooks.json` and dispatch through `scripts/dispatch.js`.
- A small discoverable skill lives at `skills/slime-codex/`.
- `plugin-eval analyze .` reports:
  - skill discovery: fixed (`plugin_skill_count: 1`)
  - active budget: moderate
  - deferred budget: excessive because repo root contains all dev docs/tests and
    vendored PixiJS.

## Decision

Keep repo-root Codex metadata for local development, but add a generated slim
plugin package before publishing to a Codex marketplace. Do not delete vendored
PixiJS from source: offline arena is a Slime invariant.

## Slim Package Contents

Required runtime files:

- `.codex-plugin/plugin.json`
- `hooks.json`
- `commands/*.md`
- `skills/slime-codex/**`
- `adapters/codex/**`
- `scripts/*.js` required by commands and hooks
- `core/**`
- `data/config.default.json`, `data/locales/**`, `data/tips*.json`
- `public/index.html`, `public/arena.js`, `public/sequencer.js`,
  `public/minions.js`, `public/vendor/pixi.min.js`

Excluded development files:

- `docs/**`
- `test/**`
- `.claude-plugin/**`
- `CLAUDE.md`, development-only sections of `AGENTS.md`
- `demo/**`
- `package-lock.json` unless the package installer needs it

## Implementation Sketch

1. Create `install/codex-package.js`.
2. Copy an explicit allowlist into `dist/slime/`.
3. Validate the staged plugin:
   ```bash
   python3 <VALIDATE_PLUGIN_PY> dist/slime
   node <PLUGIN_EVAL_JS> analyze dist/slime --format markdown
   ```
4. Add a test that the allowlist contains every file referenced by:
   - root `hooks.json`
   - `commands/*.md`
   - `scripts/serve.js` static whitelist
5. Publish/install from `dist/slime`, not the repository root.

## Open Question

`public/vendor/pixi.min.js` alone is still large in static token estimates. If
Codex packaging later supports binary assets or ignore metadata for deferred
analysis, mark Pixi as an asset. Until then, accept the package-size cost to keep
the arena offline and zero-runtime-dependency.
