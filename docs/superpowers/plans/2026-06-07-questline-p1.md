# Questline P1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Questline P1 — a zero-impact Claude Code plugin that renders the prompt/response cycle as a turn-based RPG: live statusline HUD, JRPG move callouts, turn reports, boss fights driven by todos, `/defeat` kill confirmation, and a milestone wall.

**Architecture:** Hooks translate real Claude Code events into game events appended to `~/.claude/ccq/` state files; a statusline script renders the HUD from a fast snapshot; slash commands read/record only. Pure-logic modules (mapper/boss/hud/report) are dependency-free and unit-tested; hook shells are thin stdin→lib→state adapters that always exit 0.

**Tech Stack:** Node 20 (no npm dependencies), `node:test` built-in test runner, Claude Code plugin format (hooks.json + commands/*.md), JSONL state files.

**Spec:** `docs/superpowers/specs/2026-06-07-questline-design.md` — the Observer Principle is law: no blocking, no context injection, no LLM calls, no auto-execution.

---

## File Structure

```
questline/
├── .claude-plugin/plugin.json        # plugin manifest
├── hooks/hooks.json                  # hook registration (all events)
├── scripts/
│   ├── hook-sessionstart.js          # init session, gear scan
│   ├── hook-prompt.js                # UserPromptSubmit → encounter open / boss create
│   ├── hook-pretool.js               # PreToolUse → move callout (cast)
│   ├── hook-posttool.js              # PostToolUse → resolve (damage/kill/hit/combo)
│   ├── hook-stop.js                  # Stop → turn report + kill-confirm prompt
│   ├── hook-subagentstop.js          # SubagentStop → summon returns
│   ├── hook-precompact.js            # PreCompact → memory potion
│   ├── statusline.js                 # HUD renderer (reads snapshot + stdin)
│   ├── defeat.js                     # /defeat CLI — record milestone
│   ├── battlelog.js                  # /battlelog CLI — show last turn reports
│   ├── milestones.js                 # /milestones CLI — milestone wall
│   └── lib/
│       ├── state.js                  # paths, event append/read, snapshot, profile
│       ├── mapper.js                 # real event → game event (verbs, icons, damage)
│       ├── boss.js                   # template naming, HP from todos, boss store
│       ├── hud.js                    # statusline line render (battle frame / tip)
│       └── report.js                 # turn aggregation, rank, report card
├── data/tips.json                    # loading-screen tip pool
├── commands/
│   ├── defeat.md
│   ├── battlelog.md
│   ├── milestones.md
│   └── setup.md                      # statusline install instructions
└── test/
    ├── state.test.js
    ├── mapper.test.js
    ├── boss.test.js
    ├── hud.test.js
    ├── report.test.js
    └── hooks.test.js                 # shell tests: pipe fixture stdin into hook scripts
```

Responsibilities: `lib/*` is pure logic (unit-testable, no side effects except `state.js` file IO); `scripts/hook-*` are thin adapters; commands never mutate anything except `defeat.js` (appends a milestone).

State layout (created on demand):

```
~/.claude/ccq/
├── profile.json                      # milestones, career totals, gear stats
├── sessions/<sessionId>.jsonl        # event stream (one JSON per line)
├── sessions/<sessionId>.json         # HUD snapshot (latest state, fast read)
└── bosses/<cwdHash>.json             # boss state per project dir
```

Event schema (every line in sessions/*.jsonl):

```js
// {t: 1765000000000, kind: 'cast'|'resolve'|'encounter'|'turn_end'|'summon_back'|'potion',
//  tool?: 'Edit', text: '⚔️ Carves with [Edit] → auth.ts', dmg?: 32, kill?: true, hit?: true}
```

Snapshot schema (`sessions/<id>.json`):

```js
// {sessionId, turn: 14, inTurn: true, combo: 7, kills: 3, dmg: 842, summons: 2,
//  boss: {name: 'The Auth Bugbear', hp: 38}, lastText: '⚔️ Carves…', updated: 1765000000000}
```

---

### Task 1: Plugin scaffold

**Files:**
- Create: `.claude-plugin/plugin.json`
- Create: `data/tips.json`
- Create: `.gitignore`

- [ ] **Step 1: Write manifest**

`.claude-plugin/plugin.json`:

```json
{
  "name": "questline",
  "version": "0.1.0",
  "description": "Your work goals are the bosses. Your plugins are your gear. Watch Claude fight — a zero-impact RPG layer over Claude Code.",
  "author": { "name": "qs" }
}
```

- [ ] **Step 2: Write tip pool**

`data/tips.json`:

```json
[
  "💡 Sage: summons (subagents) fight without draining your context — send them on big hunts",
  "💡 Sage: a potion (/compact) trims memory mid-fight; striking camp (/clear) starts a fresh hunt",
  "💡 Sage: plan mode forges the boss before you swing — scouted enemies drop better loot",
  "💡 Sage: combo breaks on errors — small, tested strikes keep the multiplier alive",
  "💡 Sage: gear you never trigger is carry weight — every installed plugin eats context",
  "💡 Sage: Esc interrupts Claude's turn any time — the commander outranks the fighter"
]
```

- [ ] **Step 3: Write `.gitignore`**

```
node_modules/
*.log
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: scaffold questline plugin manifest and tip pool"
```

---

### Task 2: `lib/state.js` — paths, events, snapshot, profile

**Files:**
- Create: `scripts/lib/state.js`
- Test: `test/state.test.js`

- [ ] **Step 1: Write the failing test**

`test/state.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// point state at a temp root BEFORE requiring the module
process.env.CCQ_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'ccq-'));
const state = require('../scripts/lib/state');

test('appendEvent then readEvents round-trips', () => {
  state.appendEvent('s1', { t: 1, kind: 'cast', text: 'hi' });
  state.appendEvent('s1', { t: 2, kind: 'resolve', dmg: 5 });
  const evs = state.readEvents('s1');
  assert.equal(evs.length, 2);
  assert.equal(evs[1].dmg, 5);
});

test('readEvents on missing session returns []', () => {
  assert.deepEqual(state.readEvents('nope'), []);
});

test('snapshot write/read round-trips, missing returns null', () => {
  assert.equal(state.readSnapshot('s2'), null);
  state.writeSnapshot('s2', { turn: 3 });
  assert.equal(state.readSnapshot('s2').turn, 3);
});

test('profile defaults then persists', () => {
  const p = state.readProfile();
  assert.deepEqual(p.milestones, []);
  p.milestones.push({ boss: 'The Test Golem' });
  state.writeProfile(p);
  assert.equal(state.readProfile().milestones.length, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/state.test.js`
Expected: FAIL — `Cannot find module '../scripts/lib/state'`

- [ ] **Step 3: Write implementation**

`scripts/lib/state.js`:

```js
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = process.env.CCQ_ROOT || path.join(os.homedir(), '.claude', 'ccq');

function ensureDirs() {
  for (const d of ['sessions', 'bosses', 'reports']) {
    fs.mkdirSync(path.join(ROOT, d), { recursive: true });
  }
}

const eventsPath = (id) => path.join(ROOT, 'sessions', `${id}.jsonl`);
const snapshotPath = (id) => path.join(ROOT, 'sessions', `${id}.json`);
const profilePath = () => path.join(ROOT, 'profile.json');
const reportPath = (id) => path.join(ROOT, 'reports', `${id}.txt`);

function appendEvent(id, ev) {
  ensureDirs();
  fs.appendFileSync(eventsPath(id), JSON.stringify(ev) + '\n');
}

function readEvents(id) {
  try {
    return fs.readFileSync(eventsPath(id), 'utf8')
      .split('\n').filter(Boolean).map((l) => JSON.parse(l));
  } catch { return []; }
}

function readSnapshot(id) {
  try { return JSON.parse(fs.readFileSync(snapshotPath(id), 'utf8')); }
  catch { return null; }
}

function writeSnapshot(id, snap) {
  ensureDirs();
  fs.writeFileSync(snapshotPath(id), JSON.stringify(snap));
}

function readProfile() {
  try { return JSON.parse(fs.readFileSync(profilePath(), 'utf8')); }
  catch {
    return { milestones: [], totals: { turns: 0, dmg: 0, kills: 0 }, gear: {} };
  }
}

function writeProfile(p) {
  ensureDirs();
  fs.writeFileSync(profilePath(), JSON.stringify(p, null, 2));
}

module.exports = {
  ROOT, appendEvent, readEvents, readSnapshot, writeSnapshot,
  readProfile, writeProfile, eventsPath, snapshotPath, reportPath, ensureDirs,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/state.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: state module — event log, snapshot, profile"
```

---

### Task 3: `lib/mapper.js` — casts (move callouts)

**Files:**
- Create: `scripts/lib/mapper.js`
- Test: `test/mapper.test.js`

- [ ] **Step 1: Write the failing test**

`test/mapper.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const mapper = require('../scripts/lib/mapper');

test('cast announces real tool name in brackets', () => {
  const ev = mapper.cast({ tool_name: 'Grep', tool_input: { pattern: 'authMiddleware' } }, 0);
  assert.equal(ev.kind, 'cast');
  assert.match(ev.text, /\[Grep\]/);
  assert.match(ev.text, /"authMiddleware"/);
});

test('cast verb comes from category pool, deterministic per (tool,count)', () => {
  const a = mapper.cast({ tool_name: 'Edit', tool_input: { file_path: '/x/auth.ts' } }, 1);
  const b = mapper.cast({ tool_name: 'Edit', tool_input: { file_path: '/x/auth.ts' } }, 1);
  assert.equal(a.text, b.text); // deterministic
  assert.match(a.text, /slashes|strikes|carves/i);
  assert.match(a.text, /auth\.ts/);
});

test('cast on Skill shows skill name', () => {
  const ev = mapper.cast({ tool_name: 'Skill', tool_input: { skill: 'superpowers:brainstorming' } }, 0);
  assert.match(ev.text, /superpowers:brainstorming/);
});

test('cast on unknown tool still works', () => {
  const ev = mapper.cast({ tool_name: 'mcp__github__create_pull_request', tool_input: {} }, 0);
  assert.match(ev.text, /\[mcp__github__create_pull_request\]/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/mapper.test.js`
Expected: FAIL — `Cannot find module '../scripts/lib/mapper'`

- [ ] **Step 3: Write implementation**

`scripts/lib/mapper.js`:

```js
const path = require('node:path');

const VERBS = {
  read:  ['peers into', 'surveys', 'studies'],
  grep:  ['tracks', 'hunts', 'sniffs out'],
  edit:  ['slashes', 'strikes', 'carves'],
  write: ['forges', 'conjures'],
  bash:  ['detonates', 'unleashes'],
  agent: ['summons', 'dispatches'],
  web:   ['divines', 'scries'],
  skill: ['invokes', 'channels'],
  other: ['wields', 'brandishes'],
};

const ICONS = {
  read: '🔍', grep: '🕵️', edit: '⚔️', write: '🛠️', bash: '💥',
  agent: '🐺', web: '🔮', skill: '✨', other: '🎲',
};

function category(tool) {
  const t = (tool || '').toLowerCase();
  if (t === 'read' || t === 'glob') return 'read';
  if (t === 'grep') return 'grep';
  if (t === 'edit' || t === 'notebookedit') return 'edit';
  if (t === 'write') return 'write';
  if (t === 'bash') return 'bash';
  if (t === 'agent' || t === 'task') return 'agent';
  if (t.startsWith('web')) return 'web';
  if (t === 'skill') return 'skill';
  return 'other';
}

function hash(s) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

function target(input = {}) {
  if (input.file_path) return path.basename(input.file_path);
  if (input.pattern) return `"${input.pattern}"`;
  if (input.query) return `"${input.query}"`;
  if (input.skill) return input.skill;
  if (input.description) return input.description;
  if (input.prompt) return String(input.prompt).slice(0, 40) + '…';
  if (input.command) return String(input.command).slice(0, 40);
  return '';
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function cast(payload, count) {
  const tool = payload.tool_name || 'Unknown';
  const cat = category(tool);
  const pool = VERBS[cat];
  const verb = pool[hash(tool + count) % pool.length];
  const tgt = target(payload.tool_input);
  const text = `${ICONS[cat]} ${cap(verb)} with [${tool}]${tgt ? ` → ${tgt}` : ''}…`;
  return { t: Date.now(), kind: 'cast', tool, text };
}

module.exports = { cast, category, target, hash, VERBS, ICONS };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/mapper.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: mapper casts — JRPG move callouts with verb pools"
```

---

### Task 4: `lib/mapper.js` — resolves (damage, kills, hits, combo)

**Files:**
- Modify: `scripts/lib/mapper.js`
- Test: `test/mapper.test.js` (append)

- [ ] **Step 1: Append failing tests**

Append to `test/mapper.test.js`:

```js
test('resolve Edit counts damage as changed lines and grows combo', () => {
  const ev = mapper.resolve(
    { tool_name: 'Edit', tool_input: { new_string: 'a\nb\nc' }, tool_response: {} },
    { combo: 2 }
  );
  assert.equal(ev.kind, 'resolve');
  assert.equal(ev.dmg, 3);
  assert.equal(ev.combo, 3);
  assert.match(ev.text, /3 dmg/);
  assert.match(ev.text, /combo×3/);
});

test('resolve Write counts content lines', () => {
  const ev = mapper.resolve(
    { tool_name: 'Write', tool_input: { content: 'x\ny' }, tool_response: {} },
    { combo: 0 }
  );
  assert.equal(ev.dmg, 2);
});

test('resolve test-passing Bash is a kill', () => {
  const ev = mapper.resolve(
    { tool_name: 'Bash', tool_input: { command: 'node --test test/' }, tool_response: {} },
    { combo: 0 }
  );
  assert.equal(ev.kill, true);
  assert.match(ev.text, /💀/);
});

test('resolve errored tool is a hit and breaks combo', () => {
  const ev = mapper.resolve(
    { tool_name: 'Bash', tool_input: { command: 'npm test' }, tool_response: { is_error: true } },
    { combo: 7 }
  );
  assert.equal(ev.hit, true);
  assert.equal(ev.kill, undefined);
  assert.equal(ev.combo, 0);
  assert.match(ev.text, /💥/);
});

test('resolve non-edit non-bash tool is quiet success', () => {
  const ev = mapper.resolve(
    { tool_name: 'Read', tool_input: {}, tool_response: {} },
    { combo: 4 }
  );
  assert.equal(ev.dmg, undefined);
  assert.equal(ev.combo, 4); // reads don't grow or break combo
});
```

- [ ] **Step 2: Run to verify new tests fail**

Run: `node --test test/mapper.test.js`
Expected: FAIL — `mapper.resolve is not a function`

- [ ] **Step 3: Implement resolve**

Append to `scripts/lib/mapper.js` (before `module.exports`), and add `resolve` to exports:

```js
const TEST_CMD = /\b(test|spec|pytest|jest|vitest|tape|--test)\b/;

function lineCount(s) { return s ? String(s).split('\n').length : 0; }

function resolve(payload, snap = {}) {
  const tool = payload.tool_name || 'Unknown';
  const cat = category(tool);
  const input = payload.tool_input || {};
  const isError = Boolean(payload.tool_response && payload.tool_response.is_error);
  let combo = snap.combo || 0;
  const ev = { t: Date.now(), kind: 'resolve', tool };

  if (isError) {
    ev.hit = true;
    ev.combo = 0;
    ev.text = `💥 [${tool}] backfires — hit taken! combo broken`;
    return ev;
  }

  if (cat === 'edit' || cat === 'write') {
    ev.dmg = lineCount(input.new_string ?? input.content);
    ev.combo = combo + 1;
    ev.text = `⚔️ hit! ${ev.dmg} dmg 🔥combo×${ev.combo}`;
    return ev;
  }

  if (cat === 'bash' && TEST_CMD.test(input.command || '')) {
    ev.kill = true;
    ev.combo = combo;
    ev.text = `💀 tests pass — minion slain!`;
    return ev;
  }

  ev.combo = combo;
  ev.text = '';
  return ev;
}

// add to module.exports: resolve
module.exports = { cast, resolve, category, target, hash, VERBS, ICONS };
```

- [ ] **Step 4: Run test to verify all pass**

Run: `node --test test/mapper.test.js`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: mapper resolves — damage, kills, hits, combo"
```

---

### Task 5: `lib/boss.js` — naming, HP from todos, boss store

**Files:**
- Create: `scripts/lib/boss.js`
- Test: `test/boss.test.js`

- [ ] **Step 1: Write the failing test**

`test/boss.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.CCQ_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'ccq-'));
const boss = require('../scripts/lib/boss');

test('nameBoss classifies task type from prompt keywords', () => {
  assert.equal(boss.nameBoss('fix the login crash', '/p/questline'), 'The Questline Bugbear');
  assert.equal(boss.nameBoss('refactor auth module', '/p/api'), 'The Api Colossus');
  assert.equal(boss.nameBoss('add dark mode', '/p/web'), 'The Web Hydra');
  assert.equal(boss.nameBoss('whatever else', '/p/web'), 'The Web Golem');
});

test('hpFromTodos: no todos = 100, half done = 50, all done = 0', () => {
  assert.equal(boss.hpFromTodos([]), 100);
  assert.equal(boss.hpFromTodos([
    { status: 'completed' }, { status: 'pending' }
  ]), 50);
  assert.equal(boss.hpFromTodos([{ status: 'completed' }]), 0);
});

test('boss store persists per cwd', () => {
  const b = boss.loadOrCreate('/p/web', 'add dark mode');
  assert.equal(b.name, 'The Web Hydra');
  b.hp = 40;
  boss.save('/p/web', b);
  assert.equal(boss.loadOrCreate('/p/web', 'ignored').hp, 40);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/boss.test.js`
Expected: FAIL — `Cannot find module '../scripts/lib/boss'`

- [ ] **Step 3: Write implementation**

`scripts/lib/boss.js`:

```js
const fs = require('node:fs');
const path = require('node:path');
const state = require('./state');
const { hash } = require('./mapper');

const TYPES = [
  [/fix|bug|error|crash|broken/i, 'Bugbear'],
  [/refactor|rewrite|migrate|clean/i, 'Colossus'],
  [/add|build|implement|create|feature|make/i, 'Hydra'],
  [/test|coverage/i, 'Wraith'],
  [/doc|readme|comment/i, 'Sphinx'],
];

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function nameBoss(prompt, cwd) {
  const type = (TYPES.find(([re]) => re.test(prompt || '')) || [null, 'Golem'])[1];
  const base = cap((cwd || 'unknown').split(/[\\/]/).filter(Boolean).pop() || 'unknown');
  return `The ${base} ${type}`;
}

function hpFromTodos(todos) {
  if (!todos || !todos.length) return 100;
  const done = todos.filter((t) => t.status === 'completed').length;
  return Math.max(0, Math.round(100 * (1 - done / todos.length)));
}

function bossPath(cwd) {
  return path.join(state.ROOT, 'bosses', `${hash(cwd)}.json`);
}

function loadOrCreate(cwd, prompt) {
  try { return JSON.parse(fs.readFileSync(bossPath(cwd), 'utf8')); }
  catch {
    return { name: nameBoss(prompt, cwd), hp: 100, turns: 0, created: Date.now() };
  }
}

function save(cwd, b) {
  state.ensureDirs();
  fs.writeFileSync(bossPath(cwd), JSON.stringify(b));
}

function clear(cwd) {
  try { fs.unlinkSync(bossPath(cwd)); } catch {}
}

module.exports = { nameBoss, hpFromTodos, loadOrCreate, save, clear, bossPath };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/boss.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: boss engine — template naming, todo-driven HP, per-project store"
```

---

### Task 6: Hook adapter scripts + hooks.json

**Files:**
- Create: `scripts/hook-sessionstart.js`, `scripts/hook-prompt.js`, `scripts/hook-pretool.js`, `scripts/hook-posttool.js`, `scripts/hook-subagentstop.js`, `scripts/hook-precompact.js`
- Create: `hooks/hooks.json`
- Test: `test/hooks.test.js`

All hook scripts share the same skeleton: read stdin JSON, mutate state, print nothing (or minimal JSON), ALWAYS exit 0 — wrap everything in try/catch. The Observer Principle lives here.

- [ ] **Step 1: Write the failing shell test**

`test/hooks.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'ccq-'));
const ENV = { ...process.env, CCQ_ROOT: ROOT };
const S = (f) => path.join(__dirname, '..', 'scripts', f);

function run(script, payload) {
  return execFileSync('node', [S(script)], { input: JSON.stringify(payload), env: ENV }).toString();
}

test('pretool hook appends cast event and updates snapshot', () => {
  run('hook-pretool.js', {
    session_id: 'h1', tool_name: 'Grep', tool_input: { pattern: 'foo' },
  });
  const evs = fs.readFileSync(path.join(ROOT, 'sessions', 'h1.jsonl'), 'utf8');
  assert.match(evs, /\[Grep\]/);
  const snap = JSON.parse(fs.readFileSync(path.join(ROOT, 'sessions', 'h1.json'), 'utf8'));
  assert.equal(snap.inTurn, true);
  assert.match(snap.lastText, /\[Grep\]/);
});

test('posttool hook accumulates damage and combo in snapshot', () => {
  run('hook-posttool.js', {
    session_id: 'h1', tool_name: 'Edit',
    tool_input: { new_string: 'a\nb' }, tool_response: {},
  });
  const snap = JSON.parse(fs.readFileSync(path.join(ROOT, 'sessions', 'h1.json'), 'utf8'));
  assert.equal(snap.dmg, 2);
  assert.equal(snap.combo, 1);
});

test('prompt hook opens encounter and creates boss', () => {
  run('hook-prompt.js', { session_id: 'h2', prompt: 'fix login bug', cwd: '/tmp/myapp' });
  const snap = JSON.parse(fs.readFileSync(path.join(ROOT, 'sessions', 'h2.json'), 'utf8'));
  assert.equal(snap.boss.name, 'The Myapp Bugbear');
});

test('hooks never crash on garbage stdin (observer principle)', () => {
  for (const s of ['hook-pretool.js', 'hook-posttool.js', 'hook-prompt.js',
                   'hook-sessionstart.js', 'hook-subagentstop.js', 'hook-precompact.js']) {
    const out = execFileSync('node', [S(s)], { input: 'not json{{', env: ENV });
    assert.ok(out !== null); // exited 0, no throw
  }
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/hooks.test.js`
Expected: FAIL — `ENOENT … scripts/hook-pretool.js`

- [ ] **Step 3: Implement shared helper + six hook scripts**

Add to `scripts/lib/state.js` (before `module.exports`), and export it:

```js
function readStdin() {
  try { return JSON.parse(require('node:fs').readFileSync(0, 'utf8')); }
  catch { return null; }
}
// add readStdin to module.exports
```

`scripts/hook-pretool.js`:

```js
#!/usr/bin/env node
const state = require('./lib/state');
const mapper = require('./lib/mapper');
try {
  const p = state.readStdin();
  if (p && p.session_id) {
    const id = p.session_id;
    const snap = state.readSnapshot(id) || { sessionId: id, turn: 1, combo: 0, kills: 0, dmg: 0, summons: 0 };
    snap.casts = (snap.casts || 0) + 1;
    const ev = mapper.cast(p, snap.casts);
    state.appendEvent(id, ev);
    if ((p.tool_name || '').toLowerCase() === 'agent' || (p.tool_name || '').toLowerCase() === 'task') {
      snap.summons = (snap.summons || 0) + 1;
    }
    snap.inTurn = true;
    snap.lastText = ev.text;
    snap.updated = Date.now();
    state.writeSnapshot(id, snap);
  }
} catch {}
process.exit(0);
```

`scripts/hook-posttool.js`:

```js
#!/usr/bin/env node
const state = require('./lib/state');
const mapper = require('./lib/mapper');
const boss = require('./lib/boss');
try {
  const p = state.readStdin();
  if (p && p.session_id) {
    const id = p.session_id;
    const snap = state.readSnapshot(id) || { sessionId: id, turn: 1, combo: 0, kills: 0, dmg: 0, summons: 0 };
    const ev = mapper.resolve(p, snap);
    state.appendEvent(id, ev);
    snap.combo = ev.combo ?? snap.combo;
    if (ev.dmg) snap.dmg = (snap.dmg || 0) + ev.dmg;
    if (ev.kill) snap.kills = (snap.kills || 0) + 1;
    if (ev.text) snap.lastText = ev.text;
    // TodoWrite drives boss HP
    if ((p.tool_name || '') === 'TodoWrite' && p.tool_input && p.tool_input.todos && p.cwd) {
      const b = boss.loadOrCreate(p.cwd, '');
      b.hp = boss.hpFromTodos(p.tool_input.todos);
      boss.save(p.cwd, b);
      snap.boss = { name: b.name, hp: b.hp };
    }
    snap.updated = Date.now();
    state.writeSnapshot(id, snap);
  }
} catch {}
process.exit(0);
```

`scripts/hook-prompt.js`:

```js
#!/usr/bin/env node
const state = require('./lib/state');
const boss = require('./lib/boss');
try {
  const p = state.readStdin();
  if (p && p.session_id) {
    const id = p.session_id;
    const snap = state.readSnapshot(id) || { sessionId: id, turn: 0, combo: 0, kills: 0, dmg: 0, summons: 0 };
    snap.turn = (snap.turn || 0) + 1;
    snap.inTurn = true;
    const b = boss.loadOrCreate(p.cwd || '', p.prompt || '');
    boss.save(p.cwd || '', b);
    snap.boss = { name: b.name, hp: b.hp };
    state.appendEvent(id, { t: Date.now(), kind: 'encounter', text: `⚡ Turn ${snap.turn} — ${b.name} (${b.hp}% HP)` });
    snap.lastText = `⚡ ${b.name} appears!`;
    snap.updated = Date.now();
    state.writeSnapshot(id, snap);
  }
} catch {}
process.exit(0);
```

`scripts/hook-sessionstart.js`:

```js
#!/usr/bin/env node
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const state = require('./lib/state');
try {
  const p = state.readStdin();
  if (p && p.session_id) {
    // gear scan: installed plugin cache dirs
    let gear = [];
    try {
      const cache = path.join(os.homedir(), '.claude', 'plugins', 'cache');
      gear = fs.readdirSync(cache).flatMap((mp) => {
        try { return fs.readdirSync(path.join(cache, mp)); } catch { return []; }
      });
    } catch {}
    state.writeSnapshot(p.session_id, {
      sessionId: p.session_id, turn: 0, combo: 0, kills: 0, dmg: 0,
      summons: 0, gear, inTurn: false, updated: Date.now(),
      lastText: '⚔️ Questline — awaiting first encounter',
    });
  }
} catch {}
process.exit(0);
```

`scripts/hook-subagentstop.js`:

```js
#!/usr/bin/env node
const state = require('./lib/state');
try {
  const p = state.readStdin();
  if (p && p.session_id) {
    const snap = state.readSnapshot(p.session_id);
    if (snap) {
      snap.summons = Math.max(0, (snap.summons || 0) - 1);
      snap.lastText = '🐺 A summon returns from the hunt';
      snap.updated = Date.now();
      state.appendEvent(p.session_id, { t: Date.now(), kind: 'summon_back', text: snap.lastText });
      state.writeSnapshot(p.session_id, snap);
    }
  }
} catch {}
process.exit(0);
```

`scripts/hook-precompact.js`:

```js
#!/usr/bin/env node
const state = require('./lib/state');
try {
  const p = state.readStdin();
  if (p && p.session_id) {
    const snap = state.readSnapshot(p.session_id) || { sessionId: p.session_id };
    snap.lastText = '🧪 Quaffs a memory potion (/compact) — mana refills, a scar remains';
    snap.updated = Date.now();
    state.appendEvent(p.session_id, { t: Date.now(), kind: 'potion', text: snap.lastText });
    state.writeSnapshot(p.session_id, snap);
  }
} catch {}
process.exit(0);
```

`hooks/hooks.json`:

```json
{
  "hooks": {
    "SessionStart": [
      { "hooks": [{ "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/hook-sessionstart.js\"", "timeout": 5 }] }
    ],
    "UserPromptSubmit": [
      { "hooks": [{ "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/hook-prompt.js\"", "timeout": 3 }] }
    ],
    "PreToolUse": [
      { "matcher": "*", "hooks": [{ "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/hook-pretool.js\"", "timeout": 3 }] }
    ],
    "PostToolUse": [
      { "matcher": "*", "hooks": [{ "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/hook-posttool.js\"", "timeout": 3 }] }
    ],
    "Stop": [
      { "hooks": [{ "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/hook-stop.js\"", "timeout": 5 }] }
    ],
    "SubagentStop": [
      { "hooks": [{ "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/hook-subagentstop.js\"", "timeout": 3 }] }
    ],
    "PreCompact": [
      { "hooks": [{ "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/hook-precompact.js\"", "timeout": 3 }] }
    ]
  }
}
```

Note: `hook-stop.js` is referenced here but created in Task 7 — the hooks tests in this task don't cover it yet.

- [ ] **Step 4: Run tests**

Run: `node --test test/hooks.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: hook adapters — observer-principle event collectors + hooks.json"
```

---

### Task 7: `lib/report.js` + `hook-stop.js` — turn report, rank, kill prompt

**Files:**
- Create: `scripts/lib/report.js`
- Create: `scripts/hook-stop.js`
- Test: `test/report.test.js`

- [ ] **Step 1: Write the failing test**

`test/report.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.CCQ_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'ccq-'));
const report = require('../scripts/lib/report');

test('rank: S no hits + kills, A few hits, C many hits', () => {
  assert.equal(report.rank({ hits: 0, kills: 2 }), 'S');
  assert.equal(report.rank({ hits: 1, kills: 0 }), 'A');
  assert.equal(report.rank({ hits: 3, kills: 0 }), 'B');
  assert.equal(report.rank({ hits: 5, kills: 0 }), 'C');
});

test('aggregate sums turn events since last turn_end', () => {
  const evs = [
    { kind: 'turn_end' },
    { kind: 'resolve', dmg: 10 },
    { kind: 'resolve', kill: true },
    { kind: 'resolve', hit: true },
    { kind: 'cast', tool: 'Skill', text: '✨ [superpowers:brainstorming]' },
  ];
  const a = report.aggregate(evs);
  assert.equal(a.dmg, 10);
  assert.equal(a.kills, 1);
  assert.equal(a.hits, 1);
});

test('render contains boss bar, rank and kill prompt at low HP', () => {
  const txt = report.render(
    { dmg: 100, kills: 2, hits: 0, maxCombo: 5 },
    { name: 'The Web Hydra', hp: 15 },
    { turn: 3 }
  );
  assert.match(txt, /TURN #3/);
  assert.match(txt, /Rank: S/);
  assert.match(txt, /The Web Hydra/);
  assert.match(txt, /\/defeat/); // kill confirmation offered
});

test('render omits kill prompt at high HP', () => {
  const txt = report.render(
    { dmg: 10, kills: 0, hits: 0, maxCombo: 1 },
    { name: 'The Web Hydra', hp: 80 },
    { turn: 1 }
  );
  assert.doesNotMatch(txt, /\/defeat/);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/report.test.js`
Expected: FAIL — `Cannot find module '../scripts/lib/report'`

- [ ] **Step 3: Implement report lib + stop hook**

`scripts/lib/report.js`:

```js
function rank({ hits = 0, kills = 0 }) {
  if (hits === 0 && kills > 0) return 'S';
  if (hits <= 1) return 'A';
  if (hits <= 3) return 'B';
  return 'C';
}

function aggregate(events) {
  const lastEnd = events.map((e) => e.kind).lastIndexOf('turn_end');
  const turn = events.slice(lastEnd + 1);
  let combo = 0, maxCombo = 0;
  const a = { dmg: 0, kills: 0, hits: 0, casts: 0, maxCombo: 0 };
  for (const e of turn) {
    if (e.kind === 'cast') a.casts++;
    if (e.kind === 'resolve') {
      if (e.dmg) { a.dmg += e.dmg; combo++; maxCombo = Math.max(maxCombo, combo); }
      if (e.kill) a.kills++;
      if (e.hit) { a.hits++; combo = 0; }
    }
  }
  a.maxCombo = maxCombo;
  return a;
}

function bar(pct) {
  const full = Math.round(pct / 10);
  return '█'.repeat(full) + '░'.repeat(10 - full);
}

function render(agg, bossState, snap) {
  const r = rank(agg);
  const lines = [
    `━━━ TURN #${snap.turn || '?'} ━━━ Rank: ${r}`,
    bossState ? `🗡️ Boss: ${bossState.name}  ${bar(bossState.hp)} ${bossState.hp}% HP` : null,
    `⚔️ DMG ${agg.dmg} (lines changed) | 💀 Kills ${agg.kills} | 💥 Hits ${agg.hits} | 🔥 Max combo ×${agg.maxCombo}`,
  ].filter(Boolean);
  if (bossState && bossState.hp <= 20) {
    lines.push(`⚡ ${bossState.name} staggers — confirm the kill with /questline:defeat`);
  }
  return lines.join('\n');
}

module.exports = { rank, aggregate, render, bar };
```

`scripts/hook-stop.js`:

```js
#!/usr/bin/env node
const fs = require('node:fs');
const state = require('./lib/state');
const report = require('./lib/report');
const boss = require('./lib/boss');
try {
  const p = state.readStdin();
  if (p && p.session_id) {
    const id = p.session_id;
    const snap = state.readSnapshot(id) || { sessionId: id, turn: 1 };
    const events = state.readEvents(id);
    const agg = report.aggregate(events);
    const b = p.cwd ? boss.loadOrCreate(p.cwd, '') : null;
    const card = report.render(agg, b && { name: b.name, hp: b.hp }, snap);

    state.appendEvent(id, { t: Date.now(), kind: 'turn_end', text: card });
    state.ensureDirs();
    fs.appendFileSync(state.reportPath(id), card + '\n\n');

    snap.inTurn = false;
    snap.combo = 0;
    snap.lastText = `🏆 Turn ${snap.turn} complete — Rank ${report.rank(agg)}`;
    snap.updated = Date.now();
    state.writeSnapshot(id, snap);

    // career totals
    const prof = state.readProfile();
    prof.totals.turns += 1;
    prof.totals.dmg += agg.dmg;
    prof.totals.kills += agg.kills;
    state.writeProfile(prof);

    // the only user-visible hook output: the turn report (display only)
    process.stdout.write(JSON.stringify({ systemMessage: card }));
  }
} catch {}
process.exit(0);
```

- [ ] **Step 4: Run all tests**

Run: `node --test test/`
Expected: PASS (all files)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: turn reports — rank, aggregation, stop-hook battle card"
```

---

### Task 8: `lib/hud.js` + `statusline.js` — the HUD

**Files:**
- Create: `scripts/lib/hud.js`
- Create: `scripts/statusline.js`
- Test: `test/hud.test.js`

- [ ] **Step 1: Write the failing test**

`test/hud.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const hud = require('../scripts/lib/hud');

const TIPS = ['💡 tip one', '💡 tip two'];

test('no snapshot renders idle banner', () => {
  assert.match(hud.render(null, {}, TIPS, 0), /Questline/);
});

test('fresh battle event renders battle frame with boss and combo', () => {
  const now = Date.now();
  const line = hud.render(
    { inTurn: true, combo: 7, kills: 3, dmg: 842, summons: 2,
      boss: { name: 'The Web Hydra', hp: 38 }, lastText: '⚔️ Carves with [Edit] → auth.ts…', updated: now },
    { cost: { total_cost_usd: 1.23 } }, TIPS, now
  );
  assert.match(line, /The Web Hydra/);
  assert.match(line, /combo×7/);
  assert.match(line, /🐺×2/);
  assert.match(line, /\[Edit\]/);
});

test('idle >20s during turn rotates loading tips', () => {
  const now = 10 * 60 * 1000;
  const snap = { inTurn: true, updated: now - 25000, lastText: 'x' };
  const line = hud.render(snap, {}, TIPS, now);
  assert.match(line, /💡 tip/);
});

test('out of turn shows last result, not tips', () => {
  const now = Date.now();
  const snap = { inTurn: false, updated: now - 60000, lastText: '🏆 Turn 3 complete — Rank S' };
  assert.match(hud.render(snap, {}, TIPS, now), /Rank S/);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/hud.test.js`
Expected: FAIL — `Cannot find module '../scripts/lib/hud'`

- [ ] **Step 3: Implement**

`scripts/lib/hud.js`:

```js
const { bar } = require('./report');

function render(snap, stdinJson, tips, now) {
  if (!snap) return '⚔️ Questline — awaiting first encounter';
  const idleMs = now - (snap.updated || 0);

  if (snap.inTurn && idleMs > 20000 && tips.length) {
    return tips[Math.floor(now / 20000) % tips.length];
  }

  if (!snap.inTurn) return snap.lastText || '⚔️ Questline — your turn, commander';

  const parts = [];
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

`scripts/statusline.js`:

```js
#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const state = require('./lib/state');
const hud = require('./lib/hud');
try {
  const stdin = state.readStdin() || {};
  const id = stdin.session_id;
  const snap = id ? state.readSnapshot(id) : null;
  let tips = [];
  try {
    tips = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'tips.json'), 'utf8'));
  } catch {}
  process.stdout.write(hud.render(snap, stdin, tips, Date.now()));
} catch {
  process.stdout.write('⚔️ Questline');
}
process.exit(0);
```

- [ ] **Step 4: Run all tests**

Run: `node --test test/`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: statusline HUD — battle frames, loading tips, cost ticker"
```

---

### Task 9: Commands — `/defeat`, `/battlelog`, `/milestones`, `/setup`

**Files:**
- Create: `scripts/defeat.js`, `scripts/battlelog.js`, `scripts/milestones.js`
- Create: `commands/defeat.md`, `commands/battlelog.md`, `commands/milestones.md`, `commands/setup.md`
- Test: `test/commands.test.js`

- [ ] **Step 1: Write the failing test**

`test/commands.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'ccq-'));
const ENV = { ...process.env, CCQ_ROOT: ROOT };
const S = (f) => path.join(__dirname, '..', 'scripts', f);

test('defeat records milestone and clears boss', () => {
  // seed a boss for cwd
  process.env.CCQ_ROOT = ROOT;
  const boss = require('../scripts/lib/boss');
  const b = boss.loadOrCreate('/tmp/myapp', 'fix bug');
  b.hp = 10; b.turns = 4;
  boss.save('/tmp/myapp', b);

  const out = execFileSync('node', [S('defeat.js'), '/tmp/myapp'], { env: ENV }).toString();
  assert.match(out, /DEFEATED/);
  assert.match(out, /The Myapp Bugbear/);

  const prof = JSON.parse(fs.readFileSync(path.join(ROOT, 'profile.json'), 'utf8'));
  assert.equal(prof.milestones.length, 1);
  assert.equal(prof.milestones[0].boss, 'The Myapp Bugbear');
  assert.ok(!fs.existsSync(boss.bossPath('/tmp/myapp')));
});

test('defeat with no boss says so', () => {
  const out = execFileSync('node', [S('defeat.js'), '/tmp/empty'], { env: ENV }).toString();
  assert.match(out, /No boss/i);
});

test('milestones renders the wall', () => {
  const out = execFileSync('node', [S('milestones.js')], { env: ENV }).toString();
  assert.match(out, /The Myapp Bugbear/);
  assert.match(out, /MILESTONE WALL/);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/commands.test.js`
Expected: FAIL — `ENOENT … scripts/defeat.js`

- [ ] **Step 3: Implement CLIs**

`scripts/defeat.js`:

```js
#!/usr/bin/env node
const state = require('./lib/state');
const boss = require('./lib/boss');
const fs = require('node:fs');

const cwd = process.argv[2] || process.cwd();
try {
  if (!fs.existsSync(boss.bossPath(cwd))) {
    console.log('No boss is engaged in this realm. Start a quest first.');
    process.exit(0);
  }
  const b = boss.loadOrCreate(cwd, '');
  const prof = state.readProfile();
  prof.milestones.push({
    boss: b.name, date: new Date().toISOString().slice(0, 10),
    turns: b.turns || 0, project: cwd,
  });
  state.writeProfile(prof);
  boss.clear(cwd);
  console.log([
    `⚡⚡⚡ ${b.name} — DEFEATED ⚡⚡⚡`,
    `Recorded on the Milestone Wall (${prof.milestones.length} total).`,
    `💡 Sage: quest complete — strike camp (/clear) before the next hunt.`,
  ].join('\n'));
} catch (e) {
  console.log('The killing blow glanced off. (' + e.message + ')');
}
process.exit(0);
```

`scripts/milestones.js`:

```js
#!/usr/bin/env node
const state = require('./lib/state');
try {
  const prof = state.readProfile();
  const lines = ['🏛️  MILESTONE WALL', ''];
  if (!prof.milestones.length) lines.push('No bosses defeated yet. The wall awaits.');
  for (const m of prof.milestones) {
    lines.push(`${m.date}  💀 ${m.boss}  (${m.turns} turns)  — ${m.project}`);
  }
  lines.push('', `Career: ${prof.totals.turns} turns, ${prof.totals.dmg} dmg, ${prof.totals.kills} kills`);
  console.log(lines.join('\n'));
} catch (e) { console.log('The wall is unreadable: ' + e.message); }
process.exit(0);
```

`scripts/battlelog.js`:

```js
#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const state = require('./lib/state');
let id = process.argv[2];
try {
  if (!id) {
    // fall back to the most recently written report
    const dir = path.join(state.ROOT, 'reports');
    const newest = fs.readdirSync(dir)
      .map((f) => ({ f, m: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.m - a.m)[0];
    if (!newest) { console.log('No battle log yet.'); process.exit(0); }
    id = path.basename(newest.f, '.txt');
  }
  console.log(fs.readFileSync(state.reportPath(id), 'utf8'));
} catch { console.log('No battle log for this session yet.'); }
process.exit(0);
```

- [ ] **Step 4: Write command markdown files**

`commands/defeat.md`:

```markdown
---
description: Confirm the boss kill — record a milestone on the wall
allowed-tools: Bash
---

Run this command and show its full output to the user verbatim, nothing else:

\`\`\`
node "${CLAUDE_PLUGIN_ROOT}/scripts/defeat.js" "$(pwd)"
\`\`\`
```

`commands/milestones.md`:

```markdown
---
description: Show the Milestone Wall — every boss you have slain
allowed-tools: Bash
---

Run this command and show its full output to the user verbatim, nothing else:

\`\`\`
node "${CLAUDE_PLUGIN_ROOT}/scripts/milestones.js"
\`\`\`
```

`commands/battlelog.md`:

```markdown
---
description: Show this session's turn reports
allowed-tools: Bash
---

Run this command and show its full output to the user verbatim, nothing else
(no argument = the most recent session's reports):

\`\`\`
node "${CLAUDE_PLUGIN_ROOT}/scripts/battlelog.js"
\`\`\`
```

`commands/setup.md`:

```markdown
---
description: Install the Questline statusline HUD
allowed-tools: Read, Edit, Bash
---

Help the user enable the Questline HUD:

1. Resolve the plugin root: the directory containing this command file, up one level.
2. Read `~/.claude/settings.json`. If a `statusLine` key exists, show it and ask before replacing.
3. Set:

\`\`\`json
{ "statusLine": { "type": "command", "command": "node \"<PLUGIN_ROOT>/scripts/statusline.js\"" } }
\`\`\`

4. Tell the user to restart Claude Code (or run /statusline) to see the HUD.
```

- [ ] **Step 5: Run all tests**

Run: `node --test test/`
Expected: PASS (all)

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: commands — /defeat, /milestones, /battlelog, /setup"
```

---

### Task 10: README + manual smoke test

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README**

`README.md`:

```markdown
# ⚔️ Questline

Your work goals are the bosses. Your plugins are your gear. Watch Claude fight.

Questline turns every Claude Code prompt/response cycle into a turn-based RPG —
without touching your workflow. **Observer Principle:** zero blocking, zero context
injection, zero LLM calls, zero auto-execution. Pure visuals, data, feedback.

## What you get

- **Live HUD** (statusline): boss HP, combo, kills, damage, summons, cost
- **Move callouts**: `⚔️ Carves with [Edit] → auth.ts … 32 dmg 🔥combo×8`
- **Turn reports** when Claude stops: rank S/A/B/C, battle card
- **Bosses = your real goals**, HP driven by your todo list
- **You confirm the kill**: `/questline:defeat` — AI saying "done" isn't done
- **Milestone Wall**: `/questline:milestones` — your project chronicle
- **Loading-screen tips** during long waits — real Claude Code technique

## Install

1. Install the plugin (marketplace or `--plugin-dir`)
2. Run `/questline:setup` to enable the HUD
3. Just work. The game plays itself.

## Develop

```bash
node --test test/
```
```

- [ ] **Step 2: Manual smoke test**

Run a real session against the plugin:

```bash
cd ~/Library/Mobile\ Documents/com~apple~CloudDocs/Claude/questline
claude --plugin-dir . 
```

In the session: ask Claude to "create a file foo.txt with 3 lines, then delete it".
Verify:
- `~/.claude/ccq/sessions/<id>.jsonl` fills with cast/resolve events
- Turn report appears when Claude stops (systemMessage)
- `/questline:milestones` renders the empty wall
- After `/questline:setup` + restart: statusline shows battle frames

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "docs: README + smoke test instructions"
```

---

## Deferred to P2+ (per spec phases)

- HP = usage estimation (`lib/usage.js` adapter) — P2: needs calibration research
- Haiku boss naming (opt-in) — P2
- Plan-mode boss-forging events + anti-overplanning Sage nudge — P2 (needs ExitPlanMode hook coverage)
- Gear dust detection + Sage equip/unequip advice — P2
- Web pixel viewer — P3; Weekly Wrapped — P4
