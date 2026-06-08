---
name: slime-codex
description: Use when working with Slime inside Codex, especially to explain available Slime commands, verify Codex hook state, open the arena, or continue Codex adapter development without breaking Claude Code behavior.
---

# Slime For Codex

Slime is an observer-only RPG layer for coding sessions. In Codex, hooks enter
through root `hooks.json`, run `scripts/dispatch.js`, normalize payloads with
`adapters/codex/adapter.js`, then reuse the existing observer scripts.

## Rules

- Preserve the observer principle: never alter prompts, tool inputs, or model behavior.
- Keep Codex-specific parsing in `adapters/codex/` and Codex install metadata in
  `.codex-plugin/` or root `hooks.json`.
- Set `SLIME_HARNESS=codex` when running Slime scripts from Codex commands so
  state resolves under `~/.codex/slime` unless `SLIME_ROOT` is explicit.
- Treat `/slime:setup` and `/slime:update` as Claude-Code-only until Codex exposes
  stable statusline and update flows.
- Codex does not support Slime's full command-backed statusline. It does support
  a light HUD: `Stop` hook turn reports include an Arena link when the viewer is
  live, or a `/slime:arena` hint when it is not.

## Useful Commands

- Open arena: run `SLIME_HARNESS=codex node "<PLUGIN_ROOT>/scripts/serve.js"`.
- Show battle log: run `SLIME_HARNESS=codex node "<PLUGIN_ROOT>/scripts/battlelog.js"`.
- Confirm defeat: run `SLIME_HARNESS=codex node "<PLUGIN_ROOT>/scripts/defeat.js" "$(pwd)"`.
- Show milestones: run `SLIME_HARNESS=codex node "<PLUGIN_ROOT>/scripts/milestones.js"`.
- Show weekly wrapped: run `SLIME_HARNESS=codex node "<PLUGIN_ROOT>/scripts/wrapped.js"`.

## Verification

Run these after Codex adapter changes:

```bash
npm run typecheck
npm test
python3 <VALIDATE_PLUGIN_PY> <PLUGIN_ROOT>
```

For package/install changes, also run `npm run package:codex` and validate
`dist/slime`.
