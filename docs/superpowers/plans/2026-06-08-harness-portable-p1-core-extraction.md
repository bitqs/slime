# Harness-Portable P1 — Core Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Relocate all harness-agnostic libraries from `scripts/lib/` to a top-level `core/`, with zero behavior change, establishing the boundary the adapter seam (P2) will plug into.

**Architecture:** Pure structural refactor. Library files move together into a flat `core/` directory so every intra-library `require('./x')` and `import('./types')` stays valid; only the 15 external script requirers and 16 test requirers update their paths. The full test suite + `tsc --checkJs` is the regression net — both must stay green at each commit. This is P1 of the spec `docs/superpowers/specs/2026-06-08-harness-portable-architecture-design.md`; P2 (Claude Code adapter + normalized `ingest`), P3 (modules), P4 (installer) are separate follow-up plans.

**Tech Stack:** Node 20, CommonJS, `node:test`, `tsc --checkJs` (strict JSDoc), zero runtime deps, zero build.

**Deviation from spec, decided at plan time:** the spec sketched `core/engine/` + `core/render/` subfolders. P1 uses a **flat `core/`** instead — subfolders would change every intra-library relative require (`./safe-io` → `../engine/safe-io`), tripling churn and risk for a cosmetic gain. The engine/render split, if still wanted, becomes a trivial later cosmetic pass once the boundary is proven.

---

## File Structure

**Moved (13 files, `scripts/lib/X` → `core/X`, content unchanged):**
`arena-status.js`, `boss.js`, `estimate.js`, `hud.js`, `locale.js`, `mapper.js`, `report.js`, `safe-io.js`, `sage.js`, `state.js`, `types.d.ts`, `update-check.js`, `usage.js`

**Modified (require-path rewrites only):**
- `scripts/*.js` (15 files: `hook-sessionstart`, `hook-prompt`, `hook-pretool`, `hook-posttool`, `hook-stop`, `hook-subagentstop`, `hook-precompact`, `serve`, `statusline`, `watch`, `namer`, `defeat`, `battlelog`, `milestones`, `wrapped`) — `require('./lib/` → `require('../core/`
- `test/*.js` (16 files) — `require('../scripts/lib/` → `require('../core/`
- `tsconfig.json` — add `core/**/*.js` to `include`

**Created:**
- `core/` directory (holds the moved files)
- New normalized contracts appended to `core/types.d.ts` (Task 2)

---

### Task 1: Relocate `scripts/lib/` → `core/`

**Files:**
- Move: all of `scripts/lib/*` → `core/*`
- Modify: `scripts/*.js`, `test/*.js`, `tsconfig.json`

- [ ] **Step 1: Confirm the green baseline before touching anything**

Run:
```bash
cd "$(git rev-parse --show-toplevel)"
node --test test/ 2>&1 | grep -E '^# (tests|pass|fail)'
npm run typecheck
```
Expected: `# pass 123`, `# fail 0`, and typecheck prints only the `tsc -p .` banner (no errors). If not green, STOP — fix or report before refactoring.

- [ ] **Step 2: Move the library files with git mv (preserves history)**

Run:
```bash
mkdir -p core
git mv scripts/lib/arena-status.js scripts/lib/boss.js scripts/lib/estimate.js \
       scripts/lib/hud.js scripts/lib/locale.js scripts/lib/mapper.js \
       scripts/lib/report.js scripts/lib/safe-io.js scripts/lib/sage.js \
       scripts/lib/state.js scripts/lib/types.d.ts scripts/lib/update-check.js \
       scripts/lib/usage.js core/
rmdir scripts/lib
```
Expected: `scripts/lib` is gone; `ls core` lists the 13 files. Intra-`core` requires (`./safe-io`, `./locale`, …) and `import('./types')` JSDoc references remain valid because the files kept their relative layout.

- [ ] **Step 3: Rewrite require paths in `scripts/*.js`**

Run (macOS `sed`; this also catches inline `require('./lib/…')` inside functions):
```bash
sed -i '' "s|require('./lib/|require('../core/|g" scripts/*.js
```
Expected: `grep -rn "require('./lib/" scripts` returns nothing.

- [ ] **Step 4: Rewrite require paths in `test/*.js`**

Run:
```bash
sed -i '' "s|require('../scripts/lib/|require('../core/|g" test/*.js
```
Expected: `grep -rn "scripts/lib" test` returns nothing.

- [ ] **Step 5: Point tsconfig at the new directory**

Modify `tsconfig.json` — change the `include` array to add `core/**/*.js`:
```json
  "include": ["scripts/**/*.js", "core/**/*.js", "public/sequencer.js"],
```

- [ ] **Step 6: Verify typecheck is still clean**

Run: `npm run typecheck`
Expected: only the `> slime@0.1.0 typecheck` / `> tsc -p .` banner, no diagnostics. A `Cannot find module '../core/x'` error here means a requirer was missed — grep for the offending path and fix.

- [ ] **Step 7: Verify the full suite still passes**

Run: `node --test test/ 2>&1 | grep -E '^# (tests|pass|fail)'`
Expected: `# tests 123`, `# pass 123`, `# fail 0`.

- [ ] **Step 8: Sanity-check the two runtime entrypoints load**

Run:
```bash
echo '{"session_id":"x"}' | node scripts/statusline.js; echo
echo '{}' | node -e "require('./scripts/serve.js'); console.log('serve.js loads')"
```
Expected: statusline prints a HUD line (e.g. `🟢 Slime` or a banner) and exits 0; the second prints `serve.js loads` with no `MODULE_NOT_FOUND`.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor(core): move scripts/lib → core/ (P1, no behavior change)

Relocate the 13 harness-agnostic libraries to a top-level core/ as the
boundary the harness adapter (P2) will consume. Flat layout keeps every
intra-library require valid; only external script/test requirers and
tsconfig include update. Suite (123) + typecheck stay green.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Add normalized harness contracts to `core/types.d.ts`

These are the interfaces P2 implements. Adding them now (pure type additions, no runtime code) gives P2 a stable target and verifies the shapes compile against the existing `RateWindow`.

**Files:**
- Modify: `core/types.d.ts` (append)

- [ ] **Step 1: Append the contracts**

Add to the end of `core/types.d.ts`:
```ts
// ── Harness portability contracts (implemented per-harness in adapters/) ──────

/** Normalized hook input the engine consumes, regardless of a harness's native payload. */
export interface HookContext {
  event:
    | 'session_start' | 'prompt' | 'pre_tool'
    | 'post_tool' | 'stop' | 'subagent_stop' | 'pre_compact';
  sessionId: string;
  cwd?: string;
  prompt?: string;        // prompt
  tool?: string;          // pre_tool / post_tool
  toolInput?: unknown;    // pre_tool
  toolResponse?: unknown; // post_tool
  source?: string;        // session_start
}

/** Normalized statusline input the renderer consumes. */
export interface StatuslineCtx {
  sessionId?: string;
  model?: string;
  contextPct?: number;
  costUsd?: number;
  rateLimits?: { fiveHour?: RateWindow; sevenDay?: RateWindow };
}

/** Declarative description of a harness, read by the installer (P4). */
export interface AdapterManifest {
  harness: string;
  events: HookContext['event'][];
  statuslineCommand: string;
  commands: string[];
  installTargets: string[];
}

/** The single seam: each harness folder under adapters/ exports one of these. */
export interface HarnessAdapter {
  resolveStateRoot(): string;
  resolveConfigDir(): string;
  parseHookEvent(raw: unknown, event: HookContext['event']): HookContext | null;
  parseStatusline(raw: unknown): StatuslineCtx;
  spawnNamer(prompt: string): void;
  manifest: AdapterManifest;
}
```

- [ ] **Step 2: Verify typecheck accepts the additions**

Run: `npm run typecheck`
Expected: clean (banner only). A reference error to `RateWindow` means the append landed above its definition — `RateWindow` is already defined earlier in the file, so place the new block at the very end.

- [ ] **Step 3: Verify the suite is unaffected**

Run: `node --test test/ 2>&1 | grep -E '^# (tests|pass|fail)'`
Expected: `# pass 123`, `# fail 0` (type-only change touches no runtime path).

- [ ] **Step 4: Commit**

```bash
git add core/types.d.ts
git commit -m "feat(core): normalized harness contracts (HookContext, StatuslineCtx, HarnessAdapter)

Type-only seam definitions for P2 adapters to implement. No runtime change.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage (P1 scope only):** spec P1 = "contracts + core move." Task 1 = core move; Task 2 = contracts. ✓ P2–P4 are explicitly out of this plan (separate plans).

**Placeholder scan:** no TBD/TODO; every step has exact commands, the tsconfig edit shows the literal line, Task 2 shows the full type block. ✓

**Type consistency:** `HookContext.event` union is referenced by `AdapterManifest.events` and `HarnessAdapter.parseHookEvent` via `HookContext['event']` — same source of truth. `StatuslineCtx.rateLimits` reuses the existing `RateWindow` interface (defined earlier in `types.d.ts`). ✓

**Risk check:** the only failure mode is a missed require path; Steps 6–8 catch it three ways (typecheck, suite, live entrypoint load) before the commit in Step 9.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-08-harness-portable-p1-core-extraction.md`. Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks.
2. **Inline Execution** — execute the two tasks in this session via executing-plans, with a checkpoint after each commit.

Which approach? (P2 — the adapter seam and the `hook-*.js` → `core.ingest` merge — gets its own plan after P1 lands.)
