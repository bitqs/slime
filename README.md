<div align="center">

# ⚔️ Questline

**Already addicted? Get more addicted.**

Your work goals are the bosses. Your plugins are your gear. Watch Claude fight.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Claude Code Plugin](https://img.shields.io/badge/Claude%20Code-Plugin-blueviolet)](https://docs.anthropic.com/claude-code)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)](package.json)

</div>

---

<!-- demo.gif: terminal battle feed + turn report. TODO before launch -->

Claude Code is already a turn-based game: you cast a prompt, Claude takes its turn, you wait.
Questline makes the game visible — a full RPG layer over your real work, with **zero impact on it**.

```
🗡️ The Auth Bugbear ████░░░░░░ 38% | 🔥combo×7 | 🐺×2 | 💀3 ⚔️842 | ⚔️ Carves with [Edit] → auth.ts…
```

## Quick Start

```bash
claude plugin install questline
```

Then run `/questline:setup` once to enable the HUD. That's it — just work. The game plays itself.

## What You Get

| | |
|---|---|
| ⚡ **Live battle feed** | Every tool call announced JRPG-style: `🔮 Scries with [WebSearch]…` — real tool names, real-time audit |
| 🗡️ **Bosses = your goals** | Your prompt names the monster; your todo list is its HP bar |
| 💀 **You confirm the kill** | AI saying "done" isn't done — `/questline:defeat` is your acceptance gate |
| 🏆 **Turn reports** | Rank S/A/B/C when Claude stops: damage (lines changed), kills (tests passed), max combo |
| 🏛️ **Milestone Wall** | Every defeated boss, dated — your project chronicle |
| 💡 **Loading-screen tips** | Long waits teach you real Claude Code technique |

## The Observer Principle

Questline **never** affects real usage. No blocking, no context injection, no LLM calls, no auto-execution.
Claude's behavior with Questline installed is byte-identical to without. Pure visuals, data, feedback.

## Commands

| Command | Effect |
|---|---|
| `/questline:setup` | Enable the statusline HUD |
| `/questline:defeat` | Confirm the boss kill → milestone recorded |
| `/questline:milestones` | Show the Milestone Wall |
| `/questline:battlelog` | Replay this session's turn reports |

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

## License

MIT — see [LICENSE](LICENSE).

<div align="center">

**Start your quest →** `claude plugin install questline`

</div>
