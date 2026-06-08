# Progression & Achievements — Design Spec

**Date:** 2026-06-08
**Status:** Approved direction (Option A: one unified progression engine, four layered features)

## Problem

Slime already records milestones (`/milestones`), a weekly wrap (`/wrapped`), kill
confirmation (`/defeat`), and lifetime `totals{turns,dmg,kills}`. But there is no
sense of *progression* — nothing accrues, unlocks, or gives the player a reason to
come back. We want a cohesive achievement layer that makes real work feel rewarded:
a battle-record library, unlockable badges, levels/titles, and auto quests.

## Goals

- Four reward features on **one engine**, deriving everything from the existing
  append-only event stream + `profile.json`. No duplicated stat logic.
- Rewards surface through the channels Slime already owns: arena FX/cutscenes,
  the statusline HUD, a session-start notice, and commands.
- Preserve the hard rules: observer principle (evaluate only inside fail-soft
  `stop`/`defeat` hooks, never block, no LLM calls), zero deps/build, statusline/
  flash safety, i18n both languages, test isolation via `SLIME_ROOT`.
- Fit the post-P1 architecture: the engine lives in `core/`; display/commands are
  consumers (modularized when P3 lands).

## Non-goals

- No manual goal-setting UI — quests are **auto-generated** (weekly + streak). A
  config screen for custom goals is out of scope (YAGNI for a CLI plugin).
- No external leaderboards / network. All state is local in `profile.json`.
- Not changing how damage/HP/kills are computed — those stay real-activity-driven.

## Decisions (resolved at brainstorm)

- Quests: **auto-generated only** (weekly-kills + active-day streak).
- Delivery: **one spec, four implementation phases** (kill-log → levels → badges →
  quests). Each phase ships working, testable software on its own.

## Shared foundation

### Data — extend `profile.json` (types in `core/types.d.ts`)

The existing `Milestone` is enriched in place and *becomes* the kill log (no new
parallel array). `Profile` gains progression fields; all are optional so old
profiles load and back-fill on first evaluate.

```ts
export interface Milestone {
  boss: string; date: string; turns: number; project: string;
  at?: number;        // epoch ms — enables time-of-day badges, streak, weekly windows
  dmg?: number;       // lines changed during the fight
  kills?: number;     // minions felled
  maxCombo?: number;  // peak combo in the fight
}

export interface Badge { id: string; unlockedAt: number; }

export interface Quest {
  id: string;                 // e.g. "weekly-kills" | "streak-days"
  kind: 'weekly_kills' | 'streak_days';
  target: number;
  progress: number;
  startedAt: number;
  doneAt?: number;
}

export interface Profile {
  milestones: Milestone[];
  totals: { turns: number; dmg: number; kills: number };
  gear: Record<string, unknown>;
  langStats?: Record<string, number>;
  gearUse?: Record<string, number>;
  // progression (all optional; back-filled by progression.evaluate)
  xp?: number;
  level?: number;             // cached; derived from xp
  badges?: Badge[];
  quests?: Quest[];
  streak?: { days: number; lastActiveDay: string };  // YYYY-MM-DD
}
```

### Engine — `core/progression.js` (pure, harness-agnostic, fully unit-testable)

```ts
// XP curve → level + title. Titles from data/titles.json (i18n keys).
levelFor(xp: number): { level: number; titleKey: string; nextAt: number }

// XP earned by one confirmed kill, from real fight stats (no fabrication).
xpForDefeat(m: Milestone): number   // e.g. 50 + dmg + kills*20 + maxCombo*5

// Badge ids newly satisfied by the profile's stats, excluding already-owned.
evaluateBadges(profile: Profile): string[]

// Refresh auto-quest progress against now; return completed ids + next quests.
evaluateQuests(profile: Profile, now: number): { quests: Quest[]; completed: string[] }

// Orchestrator called on defeat: enrich+push milestone, add xp, recompute level,
// eval badges + quests. Returns the mutated profile and the SlimeEvents to append.
applyDefeat(profile, m, now): { profile: Profile; events: SlimeEvent[] }

// Called on stop (per turn): bump streak/activity, refresh quest progress.
applyTurnEnd(profile, agg, now): { profile: Profile; events: SlimeEvent[] }
```

- **Stat derivation** builds a plain stats object from the profile —
  `{ kills: totals.kills, maxCombo: max(milestones.maxCombo), projects: distinct(milestones.project), bossCount: milestones.length, badgeCount: badges.length, nightKills: count(milestones where hour(at)<6) }` — then checks each badge predicate against it.
- **No `eval()`.** Badge conditions are declarative predicates (below).
- **Idempotent:** a badge unlocks only if its id is not already in `profile.badges`; XP is added once at defeat time and persisted (never re-derived from replaying events), so event replay can't double-count.

### Declarative badges — `data/badges.json`

```json
[
  { "id": "first-blood", "nameKey": "badge.firstBlood", "stat": "bossCount",  "gte": 1 },
  { "id": "combo-king",  "nameKey": "badge.comboKing",  "stat": "maxCombo",   "gte": 10 },
  { "id": "slayer",      "nameKey": "badge.slayer",     "stat": "kills",      "gte": 50 },
  { "id": "polyglot",    "nameKey": "badge.polyglot",   "stat": "projects",   "gte": 3 },
  { "id": "night-owl",   "nameKey": "badge.nightOwl",   "stat": "nightKills", "gte": 1 },
  { "id": "veteran",     "nameKey": "badge.veteran",    "stat": "bossCount",  "gte": 25 }
]
```
A badge = `{id, nameKey, stat, gte}`. Adding a badge = one JSON line + two locale
keys; no code change. This is the Vibe-Coding-friendly seam.

### Surfacing

- **Statusline (`core/hud.js`)**: when out-of-turn/idle, append a compact `Lv{n}`
  badge after the 🟢 logo. Keep it short; sanitize as always.
- **Arena (`public/`)**: `badge_unlocked` → a short sequencer cutscene (respects the
  ≤3 flashes/sec governor + `?calm=1`); `level_up` → fanfare; a small badges/level
  readout in the arena chrome.
- **Session-start (`hook-sessionstart.js`)**: if badges/level changed since last
  seen, emit a display-only `systemMessage` (same pattern as update-check).
- **Command**: new `/slime:achievements` (module) shows level + title, badge grid
  (owned vs locked), and active quests. `/milestones` stays as the kill wall, now
  enriched with dmg/kills/combo per entry.

## Four implementation phases

Each ends with `node --test test/` + `npm run typecheck` green.

- **Phase 1 — Kill log.** Enrich `Milestone` (`at`, `dmg`, `kills`, `maxCombo`);
  `boss.recordDefeat` captures them from the snapshot/turn aggregate; `/milestones`
  renders the enriched history. Unit tests for recordDefeat field capture.
- **Phase 2 — Levels & titles.** `core/progression.js` `levelFor` + `xpForDefeat`;
  `applyDefeat` adds XP + recomputes level, emits `level_up` on crossing; `data/
  titles.json` + locale keys; hud shows `Lv{n}`; session-start announces level-ups.
- **Phase 3 — Badges.** `data/badges.json` + `evaluateBadges` + `applyDefeat`
  emits `badge_unlocked`; arena unlock cutscene; `/slime:achievements` grid.
- **Phase 4 — Quests.** Auto weekly-kills + streak-days; `applyTurnEnd`/`applyDefeat`
  refresh progress, emit `quest_done`, roll the next; progress shown in
  `/slime:achievements` and (compact) statusline.

## Testing strategy

- `core/progression.js` is pure → exhaustive unit tests: `levelFor` curve
  boundaries, `xpForDefeat` math, `evaluateBadges` against fixture profiles
  (locked/owned/edge), `evaluateQuests` window math (weekly rollover, streak
  break/continue), `applyDefeat`/`applyTurnEnd` emit exactly the right events and
  are idempotent on re-run.
- Hook integration stays fail-soft; tests set `SLIME_ROOT` to a tmpdir before
  requiring core libs.
- i18n: every new user-facing string added to both `data/locales/en.json` and
  `zh.json`; a test asserts no missing keys for the new badge/title set.
- Arena FX verified in-browser with demo snapshots (PIXI closure, no unit tests).

## Risks & mitigations

- **Old profiles lack new fields** → `evaluate*` default-fill missing fields; never
  assume presence.
- **XP double-count on event replay** → XP/level/badges persist in `profile.json`
  and are mutated once at defeat/turn-end, not re-derived from the event stream.
- **Streak correctness across timezones/midnight** → track `lastActiveDay` as a
  local `YYYY-MM-DD` string; same-day = no-op, next-day = +1, gap = reset to 1.
- **Scope creep** → manual quests, network, and leaderboards are explicit non-goals.
- **Touches files mid-architecture-refactor** → engine goes in `core/` (P1 landed);
  consumers stay in current locations and modularize when P3 of the architecture
  refactor lands. The two refactors do not block each other.
