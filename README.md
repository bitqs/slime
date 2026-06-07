<div align="center">

# ⚔️ Questline

**Already addicted? Get more addicted.**

Your work goals are the bosses. Your plugins are your gear. Watch Claude fight.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Claude Code Plugin](https://img.shields.io/badge/Claude%20Code-Plugin-blueviolet)](https://docs.anthropic.com/claude-code)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)](package.json)

<sub>Zero npm dependencies at runtime — the browser arena vendors PixiJS as a static file.</sub>

</div>

---

<!-- demo.gif: terminal battle feed + turn report. TODO before launch -->

Claude Code is already a turn-based game: you cast a prompt, Claude takes its turn, you wait.
Questline makes the game visible — a full RPG layer over your real work, with **zero impact on it**.

```
🗡️ The Auth Bugbear ████░░░░░░ 38% | 🔥combo×7 | 🐺×2 | 💀3 ⚔️842 | ⚔️ Carves with [Edit] → auth.ts…
```

## Quick Start

```
/plugin marketplace add bitqs/questline
/plugin install questline@questline
```

Then run `/questline:setup` once to enable the HUD, and turn on auto-update so every
improvement reaches you (`/plugin` → Marketplaces → questline → Enable auto-update —
third-party marketplaces ship with it off).

That's it — just work. The game plays itself.

## What You Get

| | |
|---|---|
| ⚡ **Live battle feed** | Every tool call announced JRPG-style: `🔮 Scries with [WebSearch]…` — real tool names, real-time audit |
| ⚡ **Token = your real usage** | Your five-hour window is your Token reserve — at zero, the Sage tells you exactly when you're restored |
| 🧙 **The Sage** | One line of real advice per turn: rest at low Token, potion (/compact) when context runs heavy, pacing warnings |
| 🗡️ **Bosses = your goals** | Your prompt names the monster; your todo list is its HP bar |
| 💀 **You confirm the kill** | AI saying "done" isn't done — `/questline:defeat` is your acceptance gate |
| 🏆 **Turn reports** | Rank S/A/B/C when Claude stops: damage (lines changed), kills (tests passed), max combo |
| 🏛️ **Milestone Wall** | Every defeated boss, dated — your project chronicle |
| 💡 **Loading-screen tips** | Long waits teach you real Claude Code technique |
| 🎬 **Cinematic arena** | Boss intros, victory blowouts, combo escalation, gamified choices, boss forge with token-estimate tiers — PixiJS, vendored, still zero npm deps. Add `?calm=1` (or set OS reduced-motion) for a flash-free arena |

## The Observer Principle

Questline **never** affects real usage. No blocking, no context injection, no LLM calls by default, no auto-execution.
Claude's behavior with Questline installed is byte-identical to without. Pure visuals, data, feedback.

The optional Haiku boss-namer is **off by default** and costs one tiny model call per new boss (`"haikuNaming": true` in `~/.claude/ccq/config.json`).

## Speaks Your Language

Questline watches which language you prompt in and answers in kind — English and 中文 ship today.
Force one with `"lang": "zh"` in `~/.claude/ccq/config.json`.

## Commands

| Command | Effect |
|---|---|
| `/questline:setup` | Enable the statusline HUD |
| `/questline:defeat` | Confirm the boss kill → milestone recorded |
| `/questline:milestones` | Show the Milestone Wall |
| `/questline:battlelog` | Replay this session's turn reports |
| `/questline:wrapped` | Your week in battle — shareable card |

### Top-of-terminal battle pane (tmux)

```bash
tmux split-window -bv -l 6 "node \"$(pwd)/scripts/watch.js\""
```

A read-only live monitor: boss bar, your Token, combo, and the last three strikes — refreshed every second.

### Pixel Arena (browser)

```
/questline:arena
```

A local pixel-art battle stage — your knight strikes in real time as Claude works. 100% local (127.0.0.1), read-only.

## How It Works

```
 your prompt ──► UserPromptSubmit ──► ⚡ boss appears
 Claude works ─► Pre/PostToolUse ───► ⚔️ battle feed (statusline)
 Claude stops ─► Stop ─────────────► 🏆 turn report card
 you approve ──► /questline:defeat ─► 🏛️ milestone wall
```

Hooks translate real events into game state under `~/.claude/ccq/`; the statusline renders it.
Zero npm dependencies. Everything works offline.

## Develop

```bash
node --test test/
```

## Requirements

- Claude Code (plugin system)
- Node.js ≥ 18 (already required by Claude Code itself)
- No npm dependencies, no network calls, no accounts

## Uninstall

```
/plugin uninstall questline@questline
```

Hooks are removed automatically. Two optional leftovers:

- Game data: `rm -rf ~/.claude/ccq`
- Statusline: if `/questline:setup` wired the HUD, remove (or restore) the
  `statusLine` entry in `~/.claude/settings.json`

## License

MIT — see [LICENSE](LICENSE).

<div align="center">

**Start your quest →** `/plugin marketplace add bitqs/questline`

</div>
