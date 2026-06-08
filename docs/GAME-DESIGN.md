# Slime — Game Design Overview

The living design doc for the whole game. It states the fantasy, the loops, how
every real-work action maps to a game beat, the reward architecture that drives
the addiction loop, and an honest read on what's strong, weak, and worth polishing
next. For file layout see `docs/STRUCTURE.md`; for the contributor rules see
`AGENTS.md`.

## 1. Fantasy & pillars

> **Your coding session is a turn-based RPG. Already addicted to shipping? Get
> more addicted.**

You are the knight. Your current goal is the boss. Your tools are spells, your
plugins are gear, your todo list is a pack of minions. You never *play* Slime —
you work, and Slime narrates the work as a fight you're winning.

**Pillars (every feature is judged against these):**
1. **Observer.** Never change the real session. The game watches; it never steers.
2. **Instant feedback.** Every real action gets an immediate, visible reaction.
3. **Variable reward.** Surprise on top of the steady drip — the dopamine hook.
4. **Visible progress.** Something always accrues and is *seen* to accrue.
5. **Zero friction.** No build, no deps, no input — it just runs alongside you.

## 2. The core loop (three timescales)

```
moment  →  tool call → cast → resolve (damage / combo / crit / loot)   [statusline + arena, every keystroke]
turn    →  prompt → encounter; Stop → turn report + rank                [systemMessage + arena cutscene]
meta    →  boss down → kill log + XP + level + badges + quest progress   [profile, /milestones, /wrapped, /achievements]
```

The moment loop is the heartbeat; the meta loop is the reason to come back. A
healthy build keeps **all three** loops rewarding — today the moment loop is
strong, the turn loop is solid, the meta loop is still thin (see §6).

## 3. Work → game translation (the metaphor map)

| Real action | Game beat | Surface |
|---|---|---|
| Prompt submitted | Boss **encounter** — forged + named from the prompt | arena intro cutscene, nameplate |
| Tool call (pre) | **Cast** — a verb keyed to the tool (edit=slash, bash=detonate, agent=summon…) | log line, knight lunge |
| Tool result (post) | **Resolve** — damage, combo streak, crit | floaters, combo pop |
| TodoWrite list | A **pack of minions** (one slime per todo) | stage + rail |
| Todo completed | Minion **slain** | HP drain → tombstone |
| All todos done | **Ultimate** finisher on the boss | cutscene |
| Subagent dispatch | **Summon** fighting beside the knight | extra sprite |
| Plan mode / Q&A | **Feeding** — the boss grows as you plan | feeding scene |
| `/compact` | **Potion** — mana refills, a scar remains | potion cutscene |
| Stop (turn end) | **Turn report** + letter rank | systemMessage |
| Boss HP→0 at stop | **Auto-down** → milestone | victory cutscene |
| Token (5h window) | The player's **resource** (rest restores it) | statusline / HUD |
| Model · cost · context | Weapon · gold · (player HUD) | arena chrome |

**Two clean axes, deliberately separated:**
- **Combat** (HP, damage, kills, combo, rank) is driven by *real activity* — edits
  drain the boss's code-volume budget (`estLines`), todos fell minions. This is
  honest: the numbers reflect work done.
- **Appearance** (slime shape, color, size, decorations; boss species) is driven
  by *intrinsic identity seeds* (todo content, boss name), **decoupled from the
  token estimate** so the world looks varied in real use even though est is nearly
  constant. Look ≠ combat; mixing them was the old bug (everything rendered as one
  green mini).

## 4. Reward architecture (the addiction loop)

Variable-ratio reinforcement + instant feedback is the engine. Where each reward
type lives, and its health:

| Reward | Cadence | Mechanic | State |
|---|---|---|---|
| Damage / combo / crit | every tool call | deterministic, real | ✅ strong |
| Minion kills | per todo done | deterministic | ✅ strong |
| Turn rank (S/A/B…) | per turn | deterministic | ✅ solid |
| Kill log entry | per boss | persistent milestone | ✅ done (Phase 1) |
| XP / level / title | per boss | accrues, crosses thresholds | ✅ done (Phase 2) |
| **Badges (unlocks)** | on conditions | collection | ⏳ Phase 3 |
| **Quests (weekly/streak)** | rolling | goal + completion | ⏳ Phase 4 |
| **Random loot drops** | ~per tool call, rare | variable-ratio surprise | ⏳ Phase 5 |
| Weekly wrap | weekly | retrospective | ✅ done |

The **variable** half of the loop (loot drops, surprise XP) is the most
psychologically potent and is **not built yet** (Phase 5). The **visible-progress**
half past a single session (levels, badges) is also pending (Phase 2-3). These are
the two highest-leverage gaps.

## 5. Surfaces & their job

- **Statusline HUD** — highest frequency (every keystroke), lowest bandwidth (one
  line). It must carry the *signal*: boss state, combo, and soon level/loot — not
  just status. This is where most users actually live.
- **Arena (browser)** — the showcase: full FX, cutscenes, the diverse slimes. Opt-in
  (`/arena`); where delight is densest. Flash-safe (`?calm=1`).
- **tmux pane** — passive ambient monitor.
- **Commands** — `/milestones` (wall), `/wrapped` (weekly), `/battlelog`, `/defeat`;
  `/achievements` to come. The meta-loop's reading room.
- **session-start notice** — the re-entry hook ("what changed since last time").

## 6. Cohesion read — strong / weak / polish

**Strong**
- The metaphor is tight and consistent; nothing feels bolted on.
- Moment-to-moment feedback is immediate and legible.
- Combat honesty (numbers = real work) gives the game integrity.
- Appearance variety now lands (procedural slimes, seeded, decoupled).

**Weak / rough edges**
- **Meta progression, partly built.** XP/levels/titles now accrue per kill and
  show on the statusline (Phase 2 ✅). Still missing: unlockable badges (Phase 3)
  and quests (Phase 4) — the long-tail "gotta collect / weekly goal" hooks.
- **No variable reward yet.** Every reward is deterministic; the dopamine spike of
  a surprise drop is missing (Phase 5).
- **Low stakes.** The only failure state is token exhaustion (rest). There's no
  tension arc within a fight. (Intentional for a work companion — but a *soft*
  tension, e.g. a boss "enrage" on a long stall, could deepen the moment loop
  without ever harming real work.)
- **Statusline under-uses its frequency.** It shows status well but rewards little;
  level/combo-milestone/loot flashes there would hit the most-seen surface.

## 7. Polish roadmap (prioritized)

1. ~~**Levels & titles (Phase 2)**~~ — ✅ done: XP per kill, ✦Lv on the statusline,
   level_up event. Each boss now feeds visible growth.
2. **Random loot / variable reward (Phase 5)** — the missing dopamine half; small,
   rare, instant, seeded (replay-stable). Pairs with the instant-feedback pillar.
   Next-highest leverage.
3. **Badges (Phase 3)** — a collection wall; long-tail "gotta unlock them all."
4. **Quests (Phase 4)** — weekly/streak goals; the explicit return-driver.
5. **(Optional) soft tension** — a non-punishing enrage/streak beat for the moment
   loop. Design carefully against the Observer pillar.

Each is specced in `docs/superpowers/specs/2026-06-08-progression-achievements-design.md`
(Phases 1-5). Build order above maximizes felt impact per unit of work.

## 8. Guardrails (do not regress)

Observer principle · zero deps/build · statusline & flash safety · i18n (en+zh) ·
determinism in hot paths · appearance decoupled from project metrics · combat
stays real. A feature that's fun but breaks a guardrail doesn't ship.
