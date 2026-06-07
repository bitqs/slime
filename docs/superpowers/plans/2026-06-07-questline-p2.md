# Questline P2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** P2 "Flavor" — HP = real usage limits (official statusline rate_limits, estimated fallback), Sage advisor lines, gear-usage tracking, opt-in Haiku boss naming.

**Architecture:** Statusline is the only surface that receives `rate_limits` + `context_window` from Claude Code — it caches them to `~/.claude/ccq/usage.json` on every render so hooks (which never see those fields) can read the cache. Haiku naming runs as a detached child process (hooks have 2s timeouts) that writes the boss file asynchronously.

**Tech Stack:** unchanged — Node 20, zero deps, node:test.

**Key recon facts (verified 2026-06-07):**
- Statusline stdin includes `rate_limits.five_hour.{used_percentage,resets_at}`, `rate_limits.seven_day.{...}` (Pro/Max only, may be absent) and `context_window.used_percentage`
- Hook payloads do NOT include rate_limits/context_window
- EnterPlanMode/ExitPlanMode do NOT fire Pre/PostToolUse → **plan-mode boss forging deferred to P3** (needs another mechanism)
- No official usage API/file; fallback = token sums over recent transcripts (ccusage approach)

---

## File Structure

```
scripts/lib/usage.js        # NEW: usage cache write/read + estimate fallback
scripts/lib/sage.js         # NEW: advisor — one line max, priority-ordered
scripts/lib/hud.js          # MOD: HP bar + rest banner
scripts/lib/report.js       # MOD: stamina lines + sage line in card
scripts/statusline.js       # MOD: cache usage from stdin before render
scripts/hook-stop.js        # MOD: pass cached usage + sage to render
scripts/hook-pretool.js     # MOD: count gear (Skill/plugin tool) usage into profile
scripts/namer.js            # NEW: detached Haiku boss-namer (opt-in)
scripts/hook-prompt.js      # MOD: spawn namer when enabled and boss is fresh
data/config.default.json    # NEW: { "haikuNaming": false }
test/usage.test.js, test/sage.test.js  # NEW
```

Config: user file `~/.claude/ccq/config.json` overrides `data/config.default.json`.

---

### Task 1: `lib/usage.js` — cache + fallback estimate

**Files:** Create `scripts/lib/usage.js`, `test/usage.test.js`

- [ ] **Step 1: Failing test** — `test/usage.test.js`:

```js
const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.CCQ_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'ccq-'));
after(() => fs.rmSync(process.env.CCQ_ROOT, { recursive: true, force: true }));
const usage = require('../scripts/lib/usage');

test('cacheFromStatusline stores official rate limits', () => {
  usage.cacheFromStatusline({
    rate_limits: {
      five_hour: { used_percentage: 32, resets_at: 1780810000 },
      seven_day: { used_percentage: 81, resets_at: 1781000000 },
    },
    context_window: { used_percentage: 44 },
  });
  const u = usage.readCache();
  assert.equal(u.fiveHour.used, 32);
  assert.equal(u.sevenDay.used, 81);
  assert.equal(u.contextPct, 44);
  assert.equal(u.source, 'official');
});

test('cacheFromStatusline tolerates absent rate_limits (non-Pro)', () => {
  usage.cacheFromStatusline({ context_window: { used_percentage: 10 } });
  const u = usage.readCache();
  assert.equal(u.contextPct, 10);
  // previous official five_hour data must be preserved, not wiped
  assert.equal(u.fiveHour.used, 32);
});

test('hp converts used% to remaining HP', () => {
  assert.equal(usage.hp({ fiveHour: { used: 32 } }), 68);
  assert.equal(usage.hp({}), null);
});

test('readCache on empty root returns nulls', () => {
  const root2 = fs.mkdtempSync(path.join(os.tmpdir(), 'ccq2-'));
  const old = process.env.CCQ_ROOT;
  // readCache takes optional dir for testability
  const u = usage.readCache(root2);
  assert.equal(u.fiveHour, null);
  fs.rmSync(root2, { recursive: true, force: true });
});
```

- [ ] **Step 2:** `node --test test/usage.test.js` → FAIL

- [ ] **Step 3:** `scripts/lib/usage.js`:

```js
const fs = require('node:fs');
const path = require('node:path');
const state = require('./state');

const cachePath = (root) => path.join(root || state.ROOT, 'usage.json');

function readCache(root) {
  try { return JSON.parse(fs.readFileSync(cachePath(root), 'utf8')); }
  catch { return { fiveHour: null, sevenDay: null, contextPct: null, source: null, t: 0 }; }
}

function cacheFromStatusline(stdin, root) {
  if (!stdin) return;
  const prev = readCache(root);
  const rl = stdin.rate_limits || {};
  const next = {
    fiveHour: rl.five_hour
      ? { used: rl.five_hour.used_percentage, resetsAt: rl.five_hour.resets_at }
      : prev.fiveHour,
    sevenDay: rl.seven_day
      ? { used: rl.seven_day.used_percentage, resetsAt: rl.seven_day.resets_at }
      : prev.sevenDay,
    contextPct: stdin.context_window && stdin.context_window.used_percentage != null
      ? stdin.context_window.used_percentage
      : prev.contextPct,
    source: rl.five_hour ? 'official' : prev.source,
    t: Date.now(),
  };
  state.ensureDirs();
  fs.writeFileSync(cachePath(root), JSON.stringify(next));
}

function hp(cache) {
  if (!cache || !cache.fiveHour || cache.fiveHour.used == null) return null;
  return Math.max(0, Math.round(100 - cache.fiveHour.used));
}

function restTime(cache) {
  if (!cache || !cache.fiveHour || !cache.fiveHour.resetsAt) return null;
  const d = new Date(cache.fiveHour.resetsAt * 1000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

module.exports = { readCache, cacheFromStatusline, hp, restTime, cachePath };
```

(Fallback token-sum estimator intentionally NOT built until a real non-Pro user needs it — YAGNI; `source` field reserves the slot.)

- [ ] **Step 4:** `node --test test/usage.test.js` → PASS (4)
- [ ] **Step 5:** Commit `feat: usage cache — official rate limits via statusline relay`

---

### Task 2: statusline caches usage; HUD shows HP + rest banner

**Files:** Modify `scripts/statusline.js`, `scripts/lib/hud.js`; extend `test/hud.test.js`

- [ ] **Step 1: Failing tests** — append to `test/hud.test.js`:

```js
test('battle frame shows player HP from usage cache', () => {
  const now = Date.now();
  const line = hud.render(
    { inTurn: true, combo: 0, kills: 0, dmg: 5, summons: 0, lastText: 'x', updated: now },
    {}, TIPS, now,
    { fiveHour: { used: 32, resetsAt: 0 } }
  );
  assert.match(line, /⚡HP 68%/);
});

test('zero HP renders rest banner with reset time', () => {
  const now = Date.now();
  const line = hud.render(
    { inTurn: false, lastText: 'x', updated: now },
    {}, TIPS, now,
    { fiveHour: { used: 100, resetsAt: 1780810000 } }
  );
  assert.match(line, /🛌 Rest, commander/);
});
```

- [ ] **Step 2:** run → FAIL (render ignores 5th arg)

- [ ] **Step 3:** `scripts/lib/hud.js` — change signature to `render(snap, stdinJson, tips, now, usageCache)`:

```js
const { bar } = require('./report');
const usage = require('./usage');

function render(snap, stdinJson, tips, now, usageCache) {
  const hpVal = usage.hp(usageCache);
  if (hpVal === 0) {
    const t = usage.restTime(usageCache);
    return `🛌 Rest, commander. HP restored${t ? ` at ${t}` : ' soon'}.`;
  }
  if (!snap) return '⚔️ Questline — awaiting first encounter';
  const idleMs = now - (snap.updated || 0);

  if (snap.inTurn && idleMs > 20000 && tips.length) {
    return tips[Math.floor(now / 20000) % tips.length];
  }

  if (!snap.inTurn) return snap.lastText || '⚔️ Questline — your turn, commander';

  const parts = [];
  if (hpVal != null) parts.push(`⚡HP ${hpVal}%`);
  if (snap.boss) parts.push(`🗡️ ${snap.boss.name} ${bar(snap.boss.hp)} ${snap.boss.hp}%`);
  if (snap.combo > 1) parts.push(`🔥combo×${snap.combo}`);
  if (snap.summons > 0) parts.push(`🐺×${snap.summons}`);
  parts.push(`💀${snap.kills || 0} ⚔️${snap.dmg || 0}`);
  const cost = stdinJson && stdinJson.cost && stdinJson.cost.total_cost_usd;
  if (cost) parts.push(`💰$${cost.toFixed(2)}`);
  if (snap.lastText) parts.push(snap.lastText);
  return parts.join(' | ');
}

module.exports = { render };
```

`scripts/statusline.js` — cache before render:

```js
#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const state = require('./lib/state');
const hud = require('./lib/hud');
const usage = require('./lib/usage');
try {
  const stdin = state.readStdin() || {};
  usage.cacheFromStatusline(stdin);          // relay official fields to hooks
  const id = stdin.session_id;
  const snap = id ? state.readSnapshot(id) : null;
  let tips = [];
  try {
    tips = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'tips.json'), 'utf8'));
  } catch {}
  process.stdout.write(hud.render(snap, stdin, tips, Date.now(), usage.readCache()));
} catch {
  process.stdout.write('⚔️ Questline');
}
process.exit(0);
```

NOTE: existing 4 hud tests call render with 4 args → usageCache undefined → hp null → unchanged output. They must still pass untouched.

- [ ] **Step 4:** `node --test test/` → ALL pass (39)
- [ ] **Step 5:** Commit `feat: HP on HUD — official usage relay + rest banner`

---

### Task 3: `lib/sage.js` + report stamina/sage lines

**Files:** Create `scripts/lib/sage.js`, `test/sage.test.js`; modify `scripts/lib/report.js`, `scripts/hook-stop.js`

- [ ] **Step 1: Failing tests** — `test/sage.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const sage = require('../scripts/lib/sage');

test('advises rest when HP critically low', () => {
  const a = sage.advise({ usage: { fiveHour: { used: 96 } } });
  assert.match(a, /🛌|rest/i);
});

test('advises potion when context heavy', () => {
  const a = sage.advise({ usage: { fiveHour: { used: 10 }, contextPct: 85 } });
  assert.match(a, /\/compact/);
});

test('advises pacing when HP burns fast but boss barely moved', () => {
  const a = sage.advise({ usage: { fiveHour: { used: 60 } }, bossHp: 90 });
  assert.match(a, /slow|pacing|pace/i);
});

test('silent when nothing to say', () => {
  assert.equal(sage.advise({ usage: { fiveHour: { used: 10 }, contextPct: 20 }, bossHp: 50 }), null);
});

test('priority: rest beats potion', () => {
  const a = sage.advise({ usage: { fiveHour: { used: 97 }, contextPct: 90 } });
  assert.match(a, /🛌|rest/i);
});
```

- [ ] **Step 2:** run → FAIL

- [ ] **Step 3:** `scripts/lib/sage.js`:

```js
// One line max per turn report. Priority order: rest > potion > pacing.
function advise({ usage = {}, bossHp = null } = {}) {
  const used = usage.fiveHour && usage.fiveHour.used;
  if (used != null && used >= 95) {
    return '💡 Sage: 🛌 your HP is nearly spent — rest, the window restores it.';
  }
  if (usage.contextPct != null && usage.contextPct >= 80) {
    return '💡 Sage: mana runs low — a potion (/compact) or strike camp (/clear).';
  }
  if (used != null && used >= 50 && bossHp != null && bossHp >= 80) {
    return '💡 Sage: half your HP gone, the boss barely scratched — slow your pace, sharpen each strike.';
  }
  return null;
}

module.exports = { advise };
```

Modify `scripts/lib/report.js` render to accept and append stamina + sage (keep backward-compatible signature `render(agg, bossState, snap, extras = {})` where extras = `{usage, sageLine}`):

```js
function render(agg, bossState, snap, extras = {}) {
  const r = rank(agg);
  const lines = [
    `━━━ TURN #${snap.turn || '?'} ━━━ Rank: ${r}`,
    bossState ? `🗡️ Boss: ${bossState.name}  ${bar(bossState.hp)} ${bossState.hp}% HP` : null,
    `⚔️ DMG ${agg.dmg} (lines changed) | 💀 Kills ${agg.kills} | 💥 Hits ${agg.hits} | 🔥 Max combo ×${agg.maxCombo}`,
  ].filter(Boolean);
  const u = extras.usage;
  if (u && u.fiveHour && u.fiveHour.used != null) {
    const hp = Math.max(0, Math.round(100 - u.fiveHour.used));
    const weekly = u.sevenDay && u.sevenDay.used != null
      ? ` | Weekly ${bar(100 - u.sevenDay.used)} ${Math.round(100 - u.sevenDay.used)}%` : '';
    lines.push(`⚡ HP ${bar(hp)} ${hp}% (5h window)${weekly}`);
  }
  if (bossState && bossState.hp <= 20) {
    lines.push(`⚡ ${bossState.name} staggers — confirm the kill with /questline:defeat`);
  }
  if (extras.sageLine) lines.push(extras.sageLine);
  return lines.join('\n');
}
```

Append a render-extras test to `test/report.test.js`:

```js
test('render shows stamina line and sage line via extras', () => {
  const txt = report.render(
    { dmg: 1, kills: 0, hits: 0, maxCombo: 1 },
    { name: 'The Web Hydra', hp: 90 },
    { turn: 2 },
    { usage: { fiveHour: { used: 30 }, sevenDay: { used: 20 } }, sageLine: '💡 Sage: test line' }
  );
  assert.match(txt, /⚡ HP/);
  assert.match(txt, /70%/);
  assert.match(txt, /Weekly/);
  assert.match(txt, /💡 Sage: test line/);
});
```

Modify `scripts/hook-stop.js` — after computing `agg` and `b`, before render:

```js
const usage = require('./lib/usage');
const sage = require('./lib/sage');
// ...
const u = usage.readCache();
const sageLine = sage.advise({ usage: u, bossHp: b ? b.hp : null });
const card = report.render(agg, b && { name: b.name, hp: b.hp }, snap, { usage: u, sageLine });
```

(requires added at top of file with other requires)

- [ ] **Step 4:** `node --test test/` → ALL pass (45)
- [ ] **Step 5:** Commit `feat: Sage advisor + stamina in turn reports`

---

### Task 4: gear usage tracking

**Files:** Modify `scripts/hook-pretool.js`; extend `test/hooks.test.js`

- [ ] **Step 1: Failing test** — append to `test/hooks.test.js`:

```js
test('pretool counts Skill invocations as gear use in profile', () => {
  run('hook-pretool.js', {
    session_id: 'h1', tool_name: 'Skill', tool_input: { skill: 'superpowers:brainstorming' },
  });
  const prof = JSON.parse(fs.readFileSync(path.join(ROOT, 'profile.json'), 'utf8'));
  assert.equal(prof.gearUse['superpowers'], 1);
});
```

- [ ] **Step 2:** run → FAIL

- [ ] **Step 3:** In `scripts/hook-pretool.js`, inside the `if (p && p.session_id)` block after the summons logic:

```js
    if ((p.tool_name || '') === 'Skill' && p.tool_input && p.tool_input.skill) {
      const plugin = String(p.tool_input.skill).split(':')[0];
      const prof = state.readProfile();
      prof.gearUse = prof.gearUse || {};
      prof.gearUse[plugin] = (prof.gearUse[plugin] || 0) + 1;
      state.writeProfile(prof);
    }
```

- [ ] **Step 4:** `node --test test/` → ALL pass (46)
- [ ] **Step 5:** Commit `feat: gear usage tracking — skill invocations per plugin`

(Gear-dust advice in Sage deferred until enough real data accumulates — a fortnight of gearUse — revisit in P3.)

---

### Task 5: opt-in Haiku boss naming (detached)

**Files:** Create `scripts/namer.js`, `data/config.default.json`; modify `scripts/hook-prompt.js`; extend `test/commands.test.js`

- [ ] **Step 1: Failing test** — append to `test/commands.test.js`:

```js
test('namer renames boss file using injected command', () => {
  const boss = require('../scripts/lib/boss');
  const b = boss.loadOrCreate('/tmp/namerapp', 'add feature x');
  boss.save('/tmp/namerapp', b);
  execFileSync('node', [S('namer.js'), '/tmp/namerapp', 'add feature x'], {
    env: { ...ENV, QL_NAMER_CMD: `node -e "console.log('The Crimson Hydra of Namerapp')"` },
  });
  assert.equal(boss.loadOrCreate('/tmp/namerapp', '').name, 'The Crimson Hydra of Namerapp');
});
```

- [ ] **Step 2:** run → FAIL

- [ ] **Step 3:** `data/config.default.json`:

```json
{ "haikuNaming": false }
```

`scripts/namer.js`:

```js
#!/usr/bin/env node
// Detached boss namer. Hooks can't wait (2s cap) — this runs async and
// rewrites the boss file when the name arrives. Template name stays if we fail.
const { execSync } = require('node:child_process');
const boss = require('./lib/boss');

const cwd = process.argv[2];
const prompt = process.argv[3] || '';
try {
  if (!cwd) process.exit(0);
  const cmd = process.env.QL_NAMER_CMD ||
    `claude -p ${JSON.stringify(
      `Invent a short menacing RPG boss name (3-5 words, definite article) for this coding task: "${prompt.slice(0, 200)}". Reply with the name only.`
    )} --model haiku --max-turns 1`;
  const name = execSync(cmd, { timeout: 30000 }).toString().trim().split('\n').pop().trim();
  if (name && name.length >= 4 && name.length <= 60) {
    const b = boss.loadOrCreate(cwd, prompt);
    b.name = name;
    boss.save(cwd, b);
  }
} catch {}
process.exit(0);
```

Modify `scripts/hook-prompt.js` — after `boss.save(...)`, spawn namer only when enabled AND boss is brand new (hp === 100 && turns === 0):

```js
    try {
      const cfgPath = require('node:path').join(state.ROOT, 'config.json');
      let cfg = {};
      try { cfg = JSON.parse(require('node:fs').readFileSync(cfgPath, 'utf8')); } catch {}
      if (cfg.haikuNaming && b.hp === 100 && !b.named) {
        b.named = true; boss.save(p.cwd || '', b);
        const { spawn } = require('node:child_process');
        spawn('node', [require('node:path').join(__dirname, 'namer.js'), p.cwd || '', p.prompt || ''],
          { detached: true, stdio: 'ignore' }).unref();
      }
    } catch {}
```

- [ ] **Step 4:** `node --test test/` → ALL pass (47)
- [ ] **Step 5:** Commit `feat: opt-in Haiku boss naming via detached namer`

---

### Task 6: README P2 notes + smoke

- [ ] **Step 1:** README: under "What You Get" table add row `| ⚡ **HP = your real usage** | Five-hour window is your health bar; at zero the Sage tells you when you're restored |` and under Observer Principle add sentence: `The optional Haiku boss-namer is off by default and clearly costs one tiny model call per new boss ("haikuNaming": true in ~/.claude/ccq/config.json).`
- [ ] **Step 2:** Smoke: pipe a statusline stdin fixture with rate_limits through `scripts/statusline.js`, verify `⚡HP` appears and `~/.claude/ccq/usage.json` written; pipe hook-stop and verify stamina + sage lines in card.
- [ ] **Step 3:** Commit `docs: P2 — HP, Sage, Haiku naming`

---

## Deferred to P3+

- Plan-mode boss forging (no hook events for Enter/ExitPlanMode — needs transcript-watch or new harness support)
- Gear-dust Sage advice (needs accumulated gearUse data)
- Non-Pro fallback estimator (token sums — build when a real user lacks rate_limits)
- Web pixel viewer; Weekly Wrapped
