# Progression Phase 1 — Kill Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich the milestone records into a battle-record library — every defeated boss stores its timestamp and fight stats (damage, kills, peak combo) — and surface them on the Milestone Wall.

**Architecture:** `Milestone` is enriched in place (it already holds boss/date/turns/project) so it *becomes* the kill log — no parallel array. `boss.recordDefeat` gains an optional `stats` argument; its two callers (`hook-stop.js` auto-down, `defeat.js` manual) pass the per-fight aggregate from `report.aggregate`. The `/milestones` renderer prints the new fields. This is Phase 1 of `docs/superpowers/specs/2026-06-08-progression-achievements-design.md`; Phases 2–4 (levels, badges, quests) are separate plans.

**Tech Stack:** Node 20, CommonJS, `node:test`, `tsc --checkJs` strict, zero deps. Libs live in `core/` (post the P1 architecture move); entry scripts in `scripts/`.

---

## File Structure

- `core/types.d.ts` — extend the `Milestone` interface (Task 1)
- `core/boss.js` — `recordDefeat(cwd, b, stats)` captures `at` + stats (Task 1)
- `test/boss.test.js` — tests for the new capture (Task 1)
- `scripts/hook-stop.js` — pass the turn aggregate to `recordDefeat` (Task 2)
- `scripts/defeat.js` — aggregate session events, pass to `recordDefeat` (Task 2)
- `scripts/milestones.js` — render the enriched fields (Task 2)

---

### Task 1: Enrich `Milestone` + capture stats in `recordDefeat`

**Files:**
- Modify: `core/types.d.ts` (the `Milestone` interface)
- Modify: `core/boss.js` (`recordDefeat`)
- Test: `test/boss.test.js`

- [ ] **Step 1: Extend the `Milestone` type**

In `core/types.d.ts`, replace the `Milestone` interface with:
```ts
export interface Milestone {
  boss: string;
  date: string;
  turns: number;
  project: string;
  at?: number;        // epoch ms of the kill (enables later time/streak features)
  dmg?: number;       // lines changed during the fight
  kills?: number;     // minions felled
  maxCombo?: number;  // peak combo in the fight
}
```

- [ ] **Step 2: Write the failing tests**

Append to `test/boss.test.js` (the file already requires `boss` and `state`, and sets `SLIME_ROOT` at the top):
```js
test('recordDefeat: captures at + fight stats from the stats arg', () => {
  const b = boss.loadOrCreate('/p/stats', 'do work');
  b.turns = 4; b.dmgTaken = 30;
  const before = Date.now();
  boss.recordDefeat('/p/stats', b, { dmg: 42, kills: 3, maxCombo: 7 });
  const prof = state.readProfile();
  const m = prof.milestones[prof.milestones.length - 1];
  assert.equal(m.dmg, 42);
  assert.equal(m.kills, 3);
  assert.equal(m.maxCombo, 7);
  assert.ok(typeof m.at === 'number' && m.at >= before);
});

test('recordDefeat: stats optional — dmg falls back to boss.dmgTaken, others to 0', () => {
  const b = boss.loadOrCreate('/p/nostats', 'do work');
  b.dmgTaken = 15;
  boss.recordDefeat('/p/nostats', b);
  const prof = state.readProfile();
  const m = prof.milestones[prof.milestones.length - 1];
  assert.equal(m.dmg, 15);
  assert.equal(m.kills, 0);
  assert.equal(m.maxCombo, 0);
});
```
If `state` is not already required at the top of `test/boss.test.js`, add `const state = require('../core/state');` after the `boss` require.

- [ ] **Step 3: Run the new tests — verify they fail**

Run: `node --test test/boss.test.js 2>&1 | grep -E 'recordDefeat|# (pass|fail)'`
Expected: the two new tests FAIL (current `recordDefeat` ignores a third arg and writes no `dmg`/`kills`/`maxCombo`/`at`).

- [ ] **Step 4: Implement the capture**

In `core/boss.js`, replace `recordDefeat` with:
```js
/** Push a milestone for this boss and clear its file. Returns total milestone count.
 *  @param {string} cwd @param {BossState} b
 *  @param {{ dmg?: number; kills?: number; maxCombo?: number }} [stats]
 *  @returns {number} */
function recordDefeat(cwd, b, stats = {}) {
  const prof = state.readProfile();
  prof.milestones.push({
    boss: b.name, date: new Date().toISOString().slice(0, 10),
    turns: b.turns || 0, project: cwd,
    at: Date.now(),
    dmg: typeof stats.dmg === 'number' ? stats.dmg : (b.dmgTaken || 0),
    kills: stats.kills || 0,
    maxCombo: stats.maxCombo || 0,
  });
  state.writeProfile(prof);
  clear(cwd);
  return prof.milestones.length;
}
```

- [ ] **Step 5: Run tests — verify they pass**

Run: `node --test test/boss.test.js 2>&1 | grep -E '# (tests|pass|fail)'`
Expected: all pass, `# fail 0`.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: banner only, no diagnostics.

- [ ] **Step 7: Commit**

```bash
git add core/types.d.ts core/boss.js test/boss.test.js
git commit -m "feat(progression): kill log — recordDefeat captures at + dmg/kills/maxCombo

Milestone enriched in place (becomes the battle-record library). recordDefeat
takes an optional fight-stats arg; dmg falls back to boss.dmgTaken. Phase 1 of
the progression spec.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Feed stats from both callers + render them on the wall

**Files:**
- Modify: `scripts/hook-stop.js` (auto-down call)
- Modify: `scripts/defeat.js` (manual `/defeat`)
- Modify: `scripts/milestones.js` (renderer)

- [ ] **Step 1: Pass the turn aggregate in `hook-stop.js`**

In `scripts/hook-stop.js`, the auto-down branch currently reads:
```js
        const total = boss.recordDefeat(p.cwd, b);
```
`agg` (from `report.aggregate(events)`) is already in scope above it. Replace that line with:
```js
        const total = boss.recordDefeat(p.cwd, b, { dmg: agg.dmg, kills: agg.kills, maxCombo: agg.maxCombo });
```

- [ ] **Step 2: Aggregate session events in `defeat.js`**

In `scripts/defeat.js`, add the report require near the top (after the existing requires):
```js
const report = require('../core/report');
```
Then replace this block:
```js
  const b = boss.loadOrCreate(cwd, '');
  const total = boss.recordDefeat(cwd, b);
  const sid = state.newestSessionId();
  if (sid) state.appendEvent(sid, { t: Date.now(), kind: 'boss_down', boss: b.name, text: `⚡⚡⚡ ${b.name} — DEFEATED ⚡⚡⚡` });
```
with (compute the aggregate before recording so its stats land on the milestone):
```js
  const b = boss.loadOrCreate(cwd, '');
  const sid = state.newestSessionId();
  const agg = sid ? report.aggregate(state.readEvents(sid)) : { dmg: 0, kills: 0, maxCombo: 0 };
  const total = boss.recordDefeat(cwd, b, { dmg: agg.dmg, kills: agg.kills, maxCombo: agg.maxCombo });
  if (sid) state.appendEvent(sid, { t: Date.now(), kind: 'boss_down', boss: b.name, text: `⚡⚡⚡ ${b.name} — DEFEATED ⚡⚡⚡` });
```

- [ ] **Step 2.5: Sanity-check `report.aggregate` accepts the events array**

Run: `node -e "const r=require('./core/report'); console.log(JSON.stringify(r.aggregate([{kind:'resolve',dmg:5,combo:1},{kind:'resolve',kill:true}])))"`
Expected: a JSON object containing numeric `dmg`, `kills`, and `maxCombo` keys (e.g. `{"dmg":5,"kills":1,"hits":0,"casts":0,"maxCombo":1}`).

- [ ] **Step 3: Render the enriched fields in `milestones.js`**

In `scripts/milestones.js`, replace the loop body:
```js
  for (const m of prof.milestones) {
    lines.push(`${m.date}  💀 ${m.boss}  (${m.turns} turns)  — ${m.project}`);
  }
```
with:
```js
  for (const m of prof.milestones) {
    const extra = [];
    if (m.dmg) extra.push(`${m.dmg} dmg`);
    if (m.kills) extra.push(`${m.kills} kills`);
    if (m.maxCombo) extra.push(`🔥×${m.maxCombo}`);
    const tail = extra.length ? `  [${extra.join(', ')}]` : '';
    lines.push(`${m.date}  💀 ${m.boss}  (${m.turns} turns)${tail}  — ${m.project}`);
  }
```
(Old milestones without the new fields simply render as before — the `if (m.x)` guards skip absent stats.)

- [ ] **Step 4: Run the full suite + typecheck**

Run:
```bash
node --test test/ 2>&1 | grep -E '^# (tests|pass|fail)'
npm run typecheck
```
Expected: `# fail 0`; typecheck banner only.

- [ ] **Step 5: Eyeball the enriched wall**

Run (seed a profile in a throwaway root, then render):
```bash
R=$(mktemp -d); mkdir -p "$R"
cat > "$R/profile.json" <<'JSON'
{ "milestones": [
  { "boss": "The Old One", "date": "2026-06-01", "turns": 3, "project": "/p/web" },
  { "boss": "The New One", "date": "2026-06-08", "turns": 5, "project": "/p/web", "at": 1780000000000, "dmg": 120, "kills": 4, "maxCombo": 9 }
], "totals": { "turns": 8, "dmg": 120, "kills": 4 }, "gear": {} }
JSON
SLIME_ROOT="$R" node scripts/milestones.js
rm -rf "$R"
```
Expected: the old entry renders without stats; the new entry shows `[120 dmg, 4 kills, 🔥×9]`.

- [ ] **Step 6: Commit**

```bash
git add scripts/hook-stop.js scripts/defeat.js scripts/milestones.js
git commit -m "feat(progression): feed fight stats into the kill log + render on the wall

hook-stop (auto-down) and defeat.js (manual) now pass the turn/session
aggregate to recordDefeat; the Milestone Wall shows dmg/kills/maxCombo per
slain boss. Old milestones render unchanged. Phase 1 complete.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage (Phase 1 only):** spec Phase 1 = "enrich Milestone (at/dmg/kills/maxCombo); recordDefeat captures them; /milestones renders enriched history." Task 1 = type + capture; Task 2 = callers + renderer. ✓ Phases 2–4 explicitly out (separate plans).

**Placeholder scan:** none — every code step shows full code; commands have expected output; the eyeball step seeds real data. ✓

**Type consistency:** the `stats` shape `{dmg?, kills?, maxCombo?}` is identical in the `recordDefeat` JSDoc (Task 1 Step 4) and both call sites (Task 2 Steps 1–2). `Milestone` fields (`at/dmg/kills/maxCombo`) match between the type (Step 1), the writer (Step 4), and the renderer (Task 2 Step 3). `report.aggregate` returns `{dmg,kills,maxCombo,...}` — verified in Task 2 Step 2.5. ✓

**Risk check:** old profiles lack the new fields — the renderer's `if (m.x)` guards and the optional type fields handle that; Task 2 Step 5 proves it with a mixed old/new profile.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-08-progression-phase1-kill-log.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks.
2. **Inline Execution** — execute the two tasks in this session via executing-plans, checkpoint after each commit.

Which approach? (Phases 2–4 — levels, badges, quests — get their own plans after Phase 1 lands.)
