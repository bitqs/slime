# Questline — Design Spec

**Date:** 2026-06-07
**Status:** Approved pending user review
**One-liner:** A Claude Code plugin that turns every prompt/response cycle into a turn-based RPG battle — your work goals are the bosses, your plugins are your gear, your usage limits are your stamina, and the wait time becomes the show.

## 1. Problem & Positioning

Claude Code interaction is inherently turn-based: the user writes a prompt (their turn), Claude executes (its turn), and the user waits — 30 seconds to several minutes of dead time with only a spinner.

Existing gamification plugins (claude-quest: 90 achievements + XP; claude-code-achievements: Steam-style badges) are **passive sticker layers**: they award badges but have no game loop — no enemy, no resource, no decision, no per-turn feedback. Nobody has touched the wait-time experience.

**Questline's differentiation:** the entertainment layer IS the monitoring layer. Every game element maps 1:1 to real information:

- Watching the battle = watching real progress (which tools fired, which subagents run)
- Mana bar = context window; stamina bar = real usage limits
- Boss HP = actual task progress (todos)
- Kill confirmation = real user acceptance of AI work

Design laws (derived from market research):

1. **Zero friction** — fully passive via hooks; no new commands required to play
2. **Real loop** — goal → resistance → decision → feedback, not just badges
3. **Shareable** — turn reports and milestone walls are Wrapped-style screenshot bait
4. **Rewards align with real value** — game numbers are real numbers; playing well = using Claude Code well

Product language: **English** (global audience; locales later).

## 2. Core Loop (Turn-Based Fiction)

- **Your turn:** writing a prompt = issuing a command. The prompt opens an encounter.
- **Claude's turn:** execution = battle playback. Each tool call is translated into a combat action, streamed live to the statusline.
- **Turn end:** Claude stops = turn over → **Turn Report** (damage, kills, combo, rank).
- **Permission prompts** = the game pausing for the commander — reframed from interruption to "your reaction turn."

### Event → Combat Mapping (core asset)

| Real event | Game action | Value |
|---|---|---|
| Read / Glob | 🔍 Scout | vision +1 |
| Grep | 🕵️ Track | vision +2 |
| Edit / Write | ⚔️ Attack | damage = lines changed |
| Consecutive clean Edits | 🔥 Combo ×N | damage bonus |
| Bash test pass | 💀 Minion slain | XP +50 |
| Bash error / test fail | 💥 Hit taken | combo breaks, rank penalty |
| Same error 3× in a row | 😵 Debuff: Confused | flagged in report |
| Agent (subagent spawn) | 🐺 Summon | parallel front +1 |
| WebSearch / WebFetch | 🔮 Divination | intel +1 |
| Token burn | 🔵 Mana drain | MP bar falls |
| Context compaction | 🧪 Memory potion | MP refills, leaves a scar |
| Permission prompt | ⏸️ Awaiting commander | your reaction turn |
| Stop (turn ends) | 🏆 Turn report | rank S/A/B/C |

Player HP **is** real usage: HP = remaining 5-hour-window usage; the weekly limit is the deeper fatigue bar. HP regenerates in real time as the window rolls — an energy system, mobile-game-proven. HP hitting zero = you literally cannot fight; Questline computes the regen time from transcript timestamps and tells you when to come back ("🛌 Rest, commander. HP restored at 14:30"). Burning HP fast while the boss barely moves triggers a pacing warning ("HP dropping fast, boss at 82% — slow your pulls"). Hits taken (errors) break combo and hurt rank, not HP.

Mapping principle: **every mapping is simultaneously real information** — "🐺×3" means 3 subagents running; empty mana = time to `/compact`.

### Bosses = Work Goals

- The user's prompt is named as a monster (e.g., "refactor the auth module" → **Auth Ruins Colossus**)
- TodoWrite items = minions; checking one off = a kill
- Large goals = **bosses with HP bars, persisting across turns and sessions**; each turn's progress damages the boss
- Boss HP model: weighted todo completion (completed/total), with test-pass bonus

### Kill Confirmation = User Acceptance (key mechanic)

- When Claude stops AND (boss HP < 20% OR all todos checked), the report asks: **"Auth Ruins Colossus — confirm kill?"**
- User confirms via `/defeat` → milestone recorded. Declines → boss survives at low HP, fight continues next turn.
- The user is the judge, not the AI. "AI says done ≠ done" — the game mechanic doubles as acceptance testing.
- Confirmation only triggers at the threshold above; it never nags every turn.

### Milestones

Confirmed kills write to the **Milestone Wall**: date, boss name, turns taken, stamina spent, drops. The wall is a project chronicle, rendered via `/milestones`, exportable as a share card (P4).

### HP = Usage Limits (energy system)

Every turn report shows HP = real remaining Claude usage (5-hour window) plus the weekly fatigue bar. Real resource, zero fiction — players learn to plan "how many fights left today." HP regen time is computed from transcript timestamps; at zero HP the game says when to return instead of letting you stare at a rate-limit error.

### The Sage (advisor mechanics)

The game watches gear and inventory state and gives real optimization advice in game language:

- **Unequip suggestions:** every installed plugin adds tools/skills to context (carry weight). A plugin unused for N days → "🎒 desktop-commander: dust-covered, carry weight −2k tokens/turn. Unequip?"
- **Equip suggestions:** recurring task patterns with no matching gear → suggest known plugins that fit
- **Context potions:** context near limit → "🔵 Mana low — potion (/compact) or camp (/clear)?" After a confirmed boss kill → "Quest complete. Strike camp (/clear) before the next hunt — fresh context fights better."

Advice is event-driven, max one Sage line per turn report, never mid-turn interruptions.

### Gear = Installed Plugins & Skills

- Inventory = installed plugins/skills (e.g., superpowers = "the Nine-Piece Relic Set")
- Installing a new plugin = **gear drop** announcement
- A skill firing mid-turn = "Gear skill activated: superpowers:brainstorming!"
- Per-gear usage stats — which gear is daily-carry, which gathers dust (solves the real "what did I even install?" pain)

## 3. Surfaces (layered)

**Layer 1 — Terminal (everyone):**

Statusline HUD (live during Claude's turn):

```
⚔️ Lv.12 Ranger | HP ██████░░ | MP ███░░ | 🔥combo×7 | 🐺×2 | turn: 💀3 ⚔️842
```

During Claude's turn the statusline is strictly watch-only (no interaction) and alternates between:

- **Battle frames** — the live combat feed above, with small ASCII animation ticks (⚔️→🗡️→⚔️) so the line visibly "fights"
- **Loading-screen tips** — every ~20s of continuous waiting, one rotating tip in game voice: `💡 Sage: summons (subagents) fight without draining your context — send them on big hunts`. Tips are real Claude Code technique; the wait screen teaches. Tip pool ships in plugin data, community-extendable.

Turn Report (at Stop):

```
━━━ TURN #14 ━━━ Rank: S
🗡️ Boss: Auth Ruins Colossus  ████░░░░░░ 38% HP
⚔️ DMG 1,247 (lines changed) | 💀 Minions slain 3/7 (todos)
⚡ Stamina ███████░░░ 68% (5h window) | Weekly ████████░ 81%
🎒 Gear triggered: superpowers ×2, context7 ×1
💬 Boss HP low — kill confirmation next turn
```

**Layer 2 — Web viewer (optional, P3):** local server + SSE over the event log; pixel-art battle scene rendered in browser.

## 4. Architecture

```
hooks (collect) → events.jsonl (state) → statusline (HUD) + stop-report (turn report) + web (optional)
```

| Component | Responsibility | Implementation |
|---|---|---|
| Event collectors | Translate real events → game events; append to `~/.claude/ccq/sessions/<id>.jsonl` | Hooks: UserPromptSubmit (encounter open), Pre/PostToolUse (combat), Stop (report), SessionStart (load profile) |
| Boss engine | Naming + HP model | Naming: one Haiku call per encounter (prompt → boss name); fallback template "The {dir} {task-type}" when offline. HP: weighted todos + test bonus |
| Stamina reader | usage → stamina bars | **Risk:** no stable official usage API. Plan A: estimate from transcript tokens (ccusage approach). Plan B: swap to official endpoint when available. Adapter-isolated so the game layer never changes |
| HUD renderer | One statusline line | Reads latest events + statusline stdin JSON; pure local, no LLM |
| Turn report | Report at Stop | Hook `systemMessage` shows summary; full card written to file; `/battlelog` to view |
| Kill confirm | Defeat judgment | Low-HP boss → systemMessage prompt → user runs `/defeat` → milestone written |
| Milestone wall | Chronicle | `/milestones` renders from profile.json |
| Web viewer (P3) | Pixel battle livestream | Local server + SSE reading events.jsonl |

### Data

- `~/.claude/ccq/profile.json` — level, gear stats, milestones, career totals
- `~/.claude/ccq/sessions/<id>.jsonl` — per-turn event stream (web layer's data source)
- Boss state keyed by project directory — fights persist across sessions

### Iron Rules (error handling)

- Hooks **never block the workflow**: timeout ≤ 2s, fail silent, never non-zero exit. A broken game shell must never hurt the host.
- No network / no Haiku → full degradation path (template naming); every feature works offline.

### Testing

- Event mapper is a pure function; fixture-transcript replay tests
- Hook shell tests: feed fake stdin JSON, assert output

## 5. Phases

1. **P1 Playable:** hooks + statusline HUD + turn report + `/defeat` + milestone wall ← differentiated at launch
2. **P2 Flavor:** Haiku boss naming, gear-drop announcements, combo/rank tuning, report card polish
3. **P3 Spectacle:** web pixel-art live viewer
4. **P4 Spread:** Weekly Wrapped card, milestone wall image export

## 6. Local Data Source Inventory (surveyed 2026-06-07)

Everything Claude Code already writes to disk that Questline can mine, with the mechanic each feeds:

| Source | Fields | Mechanic |
|---|---|---|
| Transcript JSONL (`~/.claude/projects/<proj>/*.jsonl`) | per-message `usage` (input/output/cache tokens), `model`, `timestamp`, `gitBranch`, `cwd`, `isSidechain`, tool calls/results | damage log, mana, HP estimation, summon tracking, battlefield = branch |
| `~/.claude/history.jsonl` | every prompt ever: text, timestamp, project, sessionId | career stats, days-played streaks, peak "hunting hours", Weekly Wrapped |
| Statusline stdin JSON | model, workspace, `cost.total_cost_usd`, `total_duration_ms`, `total_lines_added/removed`, context % | live HUD: damage, gold spent, session clock, mana bar |
| Hook events | SessionStart/End, UserPromptSubmit, Pre/PostToolUse, Notification, Stop, SubagentStop, PreCompact | all combat triggers; SubagentStop = summon returns; PreCompact = potion animation |
| `~/.claude/plugins/` | installed plugins + versions | gear inventory, gear drops, dust detection (Sage) |
| Skills list (plugin + `~/.claude/skills/`) | available skills | skill book, "gear skill activated" |
| `~/.claude/todos/` | per-session todo state | minion lists, boss HP model |
| `~/.claude/plans/` | plan-mode documents | quest scrolls (a named plan = a quest contract) |
| `~/.claude/file-history/` | undo/rewind snapshots | "time magic" usage stats |
| `model` per message | Opus/Sonnet/Haiku | class fiction: Opus = Heavy Knight, Sonnet = Ranger, Haiku = Scout; fast mode = Haste buff |
| `cost.total_cost_usd` | session spend | gold ledger, Wrapped |
| Git state (branch, commits during session) | branch names, commit count | battlefield zones, victory banners |

Competitor implementation reference: claude-code-achievements persists to `~/.claude/achievements/state.json` and uses event hooks + native OS notifications — validates the hooks-to-local-state architecture. claude-quest layers quests/tutorials over the same events. Neither touches usage, plugins-as-gear, todos-as-minions, nor wait-time rendering.

## 7. Out of Scope (YAGNI)

- Cloud sync / accounts / leaderboards
- Interactive mini-games during wait (decided against: attention should stay on the battle = the work)
- Punishing mechanics (no hunger/decay — resting is not a sin)
- Non-English locales (structure allows later)
