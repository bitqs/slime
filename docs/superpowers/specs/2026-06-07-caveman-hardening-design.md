# Caveman-Style Hardening & Distribution Readiness — Design

**Date:** 2026-06-07
**Status:** Approved (pending user spec review)
**Session:** C (see COORDINATION.md)

## Background

Audit of Questline against the engineering standards of the caveman plugin (the reference
for production-grade Claude Code plugins) found gaps in four areas: filesystem safety,
terminal-output sanitization, error containment, and distribution readiness. This spec
closes them. It does NOT add features.

Two facts verified against official Claude Code docs during design:

1. **`systemMessage` in hook JSON output is displayed to the user only — it is never
   injected into the model context.** The Stop-hook turn report therefore does not
   violate the Observer Principle. No behavior change needed there.
2. **GitHub-hosted marketplaces need no official registration.** A repo containing
   `.claude-plugin/marketplace.json` is installable via
   `/plugin marketplace add <owner>/<repo>` + `/plugin install questline@questline`.
   Hooks are removed automatically on `/plugin uninstall`. Third-party marketplaces
   have auto-update **disabled by default**; users must enable it per-marketplace.

## Goals

- No hook can crash, block a session, or corrupt state — regardless of disk state.
- Nothing read from disk, user prompts, or LLM output reaches the terminal unsanitized.
- A stranger can install, update, and cleanly uninstall Questline from the README alone.

## Non-Goals

- CI/CD, CHANGELOG, npm packaging, multi-agent distribution (caveman ships to 40+
  agents; Questline is Claude Code-specific). Revisit after launch feedback.
- demo.gif (user records before launch; TODO marker stays).
- Any gameplay/feature change.

## 1. `scripts/lib/safe-io.js` — safe IO layer

New module, modeled on caveman's `safeWriteFlag`. All state files live under the
user-owned CCQ root with predictable paths — the threat is a local attacker (or a
buggy tool) replacing a path with a symlink so our write clobbers an arbitrary
user-writable file.

API:

| Function | Behavior |
|---|---|
| `safeWrite(p, content)` | Refuse if `p` or its parent is a symlink (`lstat`). Write to `p + '.tmp.<pid>'`, `fs.renameSync` over target. Create mode `0o600`. Silent no-op on any fs error. |
| `safeAppend(p, line)` | Refuse symlinks. Open with `O_APPEND \| O_NOFOLLOW` (where supported), append, close. JSONL event stream cannot rename-replace; non-atomic append accepted. Silent no-op on error. |
| `readJson(p, fallback)` | `try { JSON.parse(readFileSync) } catch { return fallback }`. Never throws. |
| `safeMkdir(p)` | `mkdirSync recursive` wrapped, refuse if existing `p` is a symlink. |

Call-site migration (every raw write/parse goes through safe-io):

| Site | Today | After |
|---|---|---|
| `state.js:9` mkdir | raw recursive | `safeMkdir` |
| `state.js:20` events JSONL | `appendFileSync` | `safeAppend` |
| `state.js:37` snapshot | `writeFileSync` | `safeWrite` |
| `state.js:49` profile | `writeFileSync` | `safeWrite` |
| `state.js:25-26` `readEvents()` | malformed line throws | per-line try/catch, skip bad lines |
| `state.js:31,41` snapshot/profile parse | raw `JSON.parse` | `readJson(p, null)` / `readJson(p, {})` |
| `boss.js:45,53` | raw parse + write | `readJson` + `safeWrite` |
| `usage.js:8,33` | raw parse + write | `readJson` + `safeWrite` |
| `locale.js:30,43` | raw parse | `readJson` |
| `hook-prompt.js:19,21,23` | raw parse | `readJson` |
| `hook-stop.js:26` report | `appendFileSync` | `safeAppend` |

`scripts/lib/state.js` stdin parse (`state.js:53`) gets a try/catch returning `{}` —
a hook fed malformed stdin must exit silently, not stack-trace.

## 2. Terminal output sanitization

`hud.js` gains `sanitize(s, max)`:

- Strip all C0/C1 control characters, including ESC (kills ANSI/OSC sequences). No
  exceptions: the HUD adds its own coloring, so legitimate data strings never contain
  escapes.
- Preserve emoji and CJK (strip by codepoint class, not ASCII whitelist).
- Truncate to `max` (default 60) by code point.

Applied to every string that originates outside the codebase before it is rendered:
boss name (user prompt → `mapper.js` → snapshot, or Haiku output when `haikuNaming`
on), tips text, locale-catalog strings, anything echoed by `hud.render()` and the
`cast.text` path in `mapper.js:41,47`. Same rationale as caveman's statusline
whitelist: statusline runs on every keystroke; a planted escape sequence in any state
file would otherwise replay into the terminal continuously.

## 3. Error containment & path resolution

- Every `hook-*.js` entry point: one top-level try/catch, silent exit 0. (Most have
  it; the fix in §1 removes the remaining throw paths — `readEvents` bad lines,
  tips/config parse in `hook-prompt.js`.)
- `state.js:5` ROOT resolution order: `CCQ_ROOT` → `CLAUDE_CONFIG_DIR + '/ccq'` →
  `~/.claude/ccq`. Matches caveman's `CLAUDE_CONFIG_DIR` contract.
- `hook-sessionstart.js:11` hardcoded `.claude/plugins/cache` walk → use
  `CLAUDE_PLUGIN_ROOT` env (provided by Claude Code to plugin hooks), fall back to
  current behavior if unset.

## 4. Distribution

- **`.claude-plugin/marketplace.json`** — self-hosted marketplace listing Questline
  itself, enabling `/plugin marketplace add bitqs/questline`. (Fast-tracked 2026-06-07
  for local dev install.)
- **Statusline chaining principle (user decision 2026-06-07): never replace an
  existing `statusLine`, append after it.** `/questline:setup` (commands/setup.md —
  Session B file, coordinate) must detect an existing `statusLine` command and write a
  wrapper that runs the user's original command first, then appends the Questline HUD
  to the same line. Uninstall docs reverse it: restore the original command preserved
  inside the wrapper.
- **`plugin.json`** — add `repository`, `homepage`, `keywords`, `license: "MIT"`,
  `author.url`. **Deliberately omit `version`**: unpinned means every git commit is a
  new version, so users on auto-update get every push with no release ritual
  (caveman's model).
- **README.md**:
  - Quick Start → real two-command install:
    ```
    /plugin marketplace add bitqs/questline
    /plugin install questline@questline
    ```
  - One line after install: enable auto-update for the marketplace (`/plugin` →
    Marketplaces → Enable auto-update) — third-party marketplaces default OFF.
  - New **Requirements** section: Node ≥ 18 (native `node:test`, `fs` constants).
  - New **Uninstall** section: `/plugin uninstall questline@questline` (hooks removed
    automatically), optional `rm -rf ~/.claude/ccq`, remove `statusLine` entry from
    `~/.claude/settings.json` (or re-run `/questline:setup` logic in reverse — manual
    instructions for now).
- **README.zh-CN.md** mirrors the three changes (coordinate with Session B, which owns
  that file — hand them the English source text, they localize).

## 5. Tests

- New `test/safe-io.test.js`: atomic write (content intact after write), symlink
  refusal (plant symlink, assert no clobber + no throw), `readJson` fallback on
  corrupt file, `safeAppend` on corrupt-permission path is silent, `sanitize` strips
  ESC/C0 and preserves emoji + 中文 + truncates.
- Existing 13 suites must stay green: `node --test test/`.
- lib API stays backward-compatible — Session B's claimed scripts import these libs;
  only internals change, signatures do not.

## 6. Session coordination

This work runs as **Session C** in COORDINATION.md. Claims:

- `scripts/lib/safe-io.js` (new), `scripts/lib/state.js`, `scripts/lib/boss.js`,
  `scripts/lib/usage.js`, `scripts/lib/locale.js` (internal changes only),
  `scripts/lib/hud.js`, `scripts/lib/mapper.js`
- `scripts/statusline.js`, `scripts/hook-prompt.js`, `scripts/hook-stop.js`,
  `scripts/hook-sessionstart.js` (containment edits only)
- `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` (new)
- `README.md` — Quick Start rewrite + Requirements + Uninstall sections (Session B owns
  only the language-switcher line; sections don't overlap, but re-read before editing)
- `test/safe-io.test.js` (new)

Conflict watch: `scripts/defeat.js`, `scripts/milestones.js`, `scripts/battlelog.js`
(Session B) import `lib/` — API compatibility is a hard constraint. `git add` explicit
paths only.

## Error handling philosophy

Inherited verbatim from caveman: **hooks must silent-fail on all filesystem errors —
never let a hook crash block session start.** Questline is a game layer; if the game
breaks, work must continue untouched. Every error path ends in "render nothing /
write nothing", never in a thrown exception or a partial file.
