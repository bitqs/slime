<div align="center">

# ⚔️ Slime

**Already addicted? Get more addicted.**

Your work goals are the bosses. Your plugins are your gear. Watch Claude fight.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Claude Code Plugin](https://img.shields.io/badge/Claude%20Code-Plugin-blueviolet)](https://docs.anthropic.com/claude-code)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)](package.json)

<sub>Zero npm dependencies at runtime — the browser arena vendors PixiJS as a static file.</sub>

**[▶️ Live arena demo](https://slime-arena-demo.shuangqu.workers.dev)** — watch a full battle before you install ([flash-free](https://slime-arena-demo.shuangqu.workers.dev/?calm=1))

</div>

---

## How to read the battle · 怎么看懂这场仗

| On screen | Meaning · 含义 |
|---|---|
| 🗡️ Boss | Your current quest — forged from your prompt, sized by estimated token cost · 当前任务,体型=预估 token 量 |
| ❤️ Boss HP | Falls as todos complete; at 0 the boss kneels, and dies automatically at session stop · todo 全勾=濒死,停机自动击杀 |
| 🟢 Minions | The todo list — each completed todo slays a slime · 小怪=todo |
| ⚡ Token | Your resource (5h rate window) · 你的资源,休息回复 |
| 🔥 Combo | Consecutive successful tool strikes · 连击 |
| 🍖 Feeding | Planning + Q&A feed the boss; it grows · 计划/问答喂怪 |
| 🐺 Summons | Subagent dispatches fight beside you · 召唤兽=subagent |

---

<!-- demo.gif: terminal battle feed + turn report. TODO before launch -->

Claude Code is already a turn-based game: you cast a prompt, Claude takes its turn, you wait.
Slime makes the game visible — a full RPG layer over your real work, with **zero impact on it**.

```
🗡️ The Auth Bugbear ████░░░░░░ 38% | 🔥combo×7 | 🐺×2 | 💀3 ⚔️842 | ⚔️ Carves with [Edit] → auth.ts…
```

## Quick Start

```
/plugin marketplace add bitqs/slime
/plugin install slime@slime
```

Then run `/slime:setup` once to enable the HUD, and turn on auto-update so every
improvement reaches you (`/plugin` → Marketplaces → slime → Enable auto-update —
third-party marketplaces ship with it off).

That's it — just work. The game plays itself.

### Codex adapter preview

This repo also includes an early Codex plugin surface:

- `.codex-plugin/plugin.json` exposes Slime as a Codex plugin.
- `hooks.json` wires Codex-compatible hook events through `scripts/dispatch.js`.
- `adapters/codex/` normalizes Codex hook/status payloads before dispatch reuses the existing observer scripts.
- Codex state defaults to `~/.codex/slime` when hooks run with `SLIME_HARNESS=codex`.

Codex does not expose a stable command-backed statusline equivalent yet, so the
full Claude Code HUD is not mirrored in the TUI footer. Instead, Codex gets a
light HUD: each turn report includes the Slime battle card plus an Arena link or
`/slime:arena` hint. The arena, battlelog, milestones, and wrapped
scripts read the shared Slime state with `SLIME_HARNESS=codex`.

## What You Get

| | |
|---|---|
| ⚡ **Live battle feed** | Every tool call announced JRPG-style: `🔮 Scries with [WebSearch]…` — real tool names, real-time audit |
| ⚡ **Token = your real usage** | Your five-hour window is your Token reserve — at zero, the Sage tells you exactly when you're restored |
| 🧙 **The Sage** | One line of real advice per turn: rest at low Token, potion (/compact) when context runs heavy, pacing warnings |
| 🗡️ **Bosses = your goals** | Your prompt names the monster; your todo list is its HP bar |
| 💀 **Kills confirm themselves** | Clear every todo and the boss falls on its own when the session ends — milestone recorded, no extra typing |
| 🏆 **Turn reports** | Rank S/A/B/C when Claude stops: damage (lines changed), kills (tests passed), max combo |
| ✦ **Level up** | Confirmed kills grant XP → levels, titles, and unlockable badges (`/slime:achievements`) |
| 🏛️ **Milestone Wall** | Every defeated boss, dated — your project chronicle |
| 💡 **Loading-screen tips** | Long waits teach you real Claude Code technique |
| 🎬 **Cinematic arena** | Boss intros, victory blowouts, combo escalation, gamified choices, boss forge with token-estimate tiers — PixiJS, vendored, still zero npm deps. Add `?calm=1` (or set OS reduced-motion) for a flash-free arena |

## The Observer Principle

Slime **never** affects real usage. No blocking, no context injection, no LLM calls by default, no auto-execution.
Claude's behavior with Slime installed is byte-identical to without. Pure visuals, data, feedback.

The optional Haiku boss-namer is **off by default** and costs one tiny model call per new boss (`"haikuNaming": true` in `~/.claude/slime/config.json`).

## Speaks Your Language

Slime watches which language you prompt in and answers in kind — English and 中文 ship today.
Force one with `"lang": "zh"` in `~/.claude/slime/config.json`.

## Commands

| Command | Effect |
|---|---|
| `/slime:setup` | Enable the statusline HUD |
| `/slime:achievements` | Your level, title, and badge grid |
| `/slime:milestones` | Show the Milestone Wall |
| `/slime:battlelog` | Replay this session's turn reports |
| `/slime:wrapped` | Your week in battle — shareable card |

### Top-of-terminal battle pane (tmux)

```bash
tmux split-window -bv -l 6 "node \"$(pwd)/scripts/watch.js\""
```

A read-only live monitor: boss bar, your Token, combo, and the last three strikes — refreshed every second.

### Pixel Arena (browser)

```
/slime:arena
```

A local pixel-art battle stage — your knight strikes in real time as Claude works. 100% local (127.0.0.1), read-only.

## How It Works

```
 your prompt ──► UserPromptSubmit ──► ⚡ boss appears
 Claude works ─► Pre/PostToolUse ───► ⚔️ battle feed (statusline)
 Claude stops ─► Stop ─────────────► 🏆 turn report card
 all todos done ─► boss falls at Stop ─► 🏛️ milestone wall
```

Hooks translate real events into game state under `~/.claude/slime/`; the statusline renders it.
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
/plugin uninstall slime@slime
```

Hooks are removed automatically. Two optional leftovers:

- Game data: `rm -rf ~/.claude/slime`
- Statusline: if `/slime:setup` wired the HUD, remove (or restore) the
  `statusLine` entry in `~/.claude/settings.json`

## License

MIT — see [LICENSE](LICENSE).

<div align="center">

**Start your quest →** `/plugin marketplace add bitqs/slime`

</div>
