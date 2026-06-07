# Caveman-Style Hardening & Distribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden Questline's filesystem IO, terminal output, and error paths to caveman-plugin standards, and make it installable/updatable/uninstallable by strangers.

**Architecture:** New `scripts/lib/safe-io.js` becomes the single IO gateway (atomic writes, symlink refusal, tolerant JSON reads); `hud.js` gains a `sanitize()` applied to every externally-originated string before terminal output; `scripts/lib/update-check.js` + a SessionStart extension surface new git commits as a display-only `systemMessage`. Distribution gaps closed in `plugin.json` and README.

**Tech Stack:** Node ≥18, zero dependencies, native `node:test`. Repo: `~/Library/Mobile Documents/com~apple~CloudDocs/Claude/questline` (path has spaces — always quote).

**Spec:** `docs/superpowers/specs/2026-06-07-caveman-hardening-design.md`

**Rules for every task:**
- lib API is FROZEN — module.exports signatures must not change (other scripts import them).
- `git add` explicit paths only, never `-A`/`.` (COORDINATION.md rule).
- After each task: `node --test test/` — all suites green, no exceptions.

---

### Task 1: safe-io module

**Files:**
- Create: `scripts/lib/safe-io.js`
- Test: `test/safe-io.test.js`

- [ ] **Step 1: Write failing tests**

Create `test/safe-io.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { safeWrite, safeAppend, readJson, safeMkdir } = require('../scripts/lib/safe-io');

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ccq-safeio-'));
}

test('safeWrite writes content atomically with 0600', () => {
  const d = tmpdir();
  const p = path.join(d, 'a.json');
  assert.strictEqual(safeWrite(p, '{"x":1}'), true);
  assert.strictEqual(fs.readFileSync(p, 'utf8'), '{"x":1}');
  if (process.platform !== 'win32') {
    assert.strictEqual(fs.statSync(p).mode & 0o777, 0o600);
  }
  // no temp file left behind
  assert.deepStrictEqual(fs.readdirSync(d), ['a.json']);
});

test('safeWrite refuses symlink target, victim untouched', () => {
  const d = tmpdir();
  const victim = path.join(d, 'victim.txt');
  fs.writeFileSync(victim, 'precious');
  const link = path.join(d, 'flag.json');
  fs.symlinkSync(victim, link);
  assert.strictEqual(safeWrite(link, 'evil'), false);
  assert.strictEqual(fs.readFileSync(victim, 'utf8'), 'precious');
});

test('safeWrite refuses symlinked parent dir', () => {
  const d = tmpdir();
  const realDir = path.join(d, 'real');
  fs.mkdirSync(realDir);
  const linkDir = path.join(d, 'linkdir');
  fs.symlinkSync(realDir, linkDir);
  assert.strictEqual(safeWrite(path.join(linkDir, 'f.json'), 'x'), false);
  assert.deepStrictEqual(fs.readdirSync(realDir), []);
});

test('safeAppend appends lines, refuses symlink', () => {
  const d = tmpdir();
  const p = path.join(d, 'log.jsonl');
  assert.strictEqual(safeAppend(p, 'one\n'), true);
  assert.strictEqual(safeAppend(p, 'two\n'), true);
  assert.strictEqual(fs.readFileSync(p, 'utf8'), 'one\ntwo\n');
  const victim = path.join(d, 'v.txt');
  fs.writeFileSync(victim, '');
  const link = path.join(d, 'lnk.jsonl');
  fs.symlinkSync(victim, link);
  assert.strictEqual(safeAppend(link, 'evil\n'), false);
  assert.strictEqual(fs.readFileSync(victim, 'utf8'), '');
});

test('readJson returns parsed object or fallback, never throws', () => {
  const d = tmpdir();
  const good = path.join(d, 'good.json');
  fs.writeFileSync(good, '{"a":1}');
  assert.deepStrictEqual(readJson(good, null), { a: 1 });
  const bad = path.join(d, 'bad.json');
  fs.writeFileSync(bad, '{corrupt!!');
  assert.deepStrictEqual(readJson(bad, { fb: true }), { fb: true });
  assert.strictEqual(readJson(path.join(d, 'missing.json'), 42), 42);
});

test('safeMkdir creates nested dirs, refuses symlinked target', () => {
  const d = tmpdir();
  assert.strictEqual(safeMkdir(path.join(d, 'x', 'y')), true);
  assert.ok(fs.statSync(path.join(d, 'x', 'y')).isDirectory());
  const real = path.join(d, 'real2');
  fs.mkdirSync(real);
  const lnk = path.join(d, 'lnk2');
  fs.symlinkSync(real, lnk);
  assert.strictEqual(safeMkdir(lnk), false);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd "$HOME/Library/Mobile Documents/com~apple~CloudDocs/Claude/questline" && node --test test/safe-io.test.js`
Expected: FAIL — `Cannot find module '../scripts/lib/safe-io'`

- [ ] **Step 3: Implement `scripts/lib/safe-io.js`**

```js
'use strict';
// safe-io — the single gateway for Questline state IO.
// Threat model: predictable user-owned paths under ~/.claude/ccq; a local
// attacker (or buggy tool) may swap a path for a symlink so our write clobbers
// an arbitrary user-writable file. Every function silent-fails: Questline is a
// game layer — if the game breaks, work continues untouched.
const fs = require('node:fs');
const path = require('node:path');

function isSymlink(p) {
  try { return fs.lstatSync(p).isSymbolicLink(); } catch { return false; }
}

function refuse(p) {
  return isSymlink(p) || isSymlink(path.dirname(p));
}

// Atomic replace: temp + rename. Mode 0600. Returns false on any refusal/error.
function safeWrite(p, content) {
  try {
    if (refuse(p)) return false;
    const tmp = `${p}.tmp.${process.pid}`;
    fs.writeFileSync(tmp, content, { mode: 0o600 });
    fs.renameSync(tmp, p);
    return true;
  } catch { return false; }
}

// Append for JSONL streams (rename-replace impossible). O_NOFOLLOW where the
// platform supports it; symlink pre-check covers the rest.
function safeAppend(p, line) {
  try {
    if (refuse(p)) return false;
    const flags = fs.constants.O_APPEND | fs.constants.O_CREAT | fs.constants.O_WRONLY
      | (fs.constants.O_NOFOLLOW || 0);
    const fd = fs.openSync(p, flags, 0o600);
    try { fs.writeFileSync(fd, line); } finally { fs.closeSync(fd); }
    return true;
  } catch { return false; }
}

// Tolerant read: corrupt, missing, or non-JSON file → fallback. Never throws.
function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}

function safeMkdir(p) {
  try {
    if (isSymlink(p)) return false;
    fs.mkdirSync(p, { recursive: true });
    return true;
  } catch { return false; }
}

module.exports = { safeWrite, safeAppend, readJson, safeMkdir };
```

- [ ] **Step 4: Run tests**

Run: `node --test test/safe-io.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/safe-io.js test/safe-io.test.js
git commit -m "feat: safe-io layer — atomic writes, symlink refusal, tolerant JSON"
```

---

### Task 2: sanitize() in hud.js

**Files:**
- Modify: `scripts/lib/hud.js`
- Test: `test/safe-io.test.js` (append)

- [ ] **Step 1: Write failing tests** (append to `test/safe-io.test.js`)

```js
const { sanitize } = require('../scripts/lib/hud');

test('sanitize strips ESC/C0/C1 control chars', () => {
  assert.strictEqual(sanitize('a\x1b[31mred\x1b[0mb'), 'a[31mred[0mb');
  assert.strictEqual(sanitize('x\x00\x07\x9by'), 'xy');
  assert.strictEqual(sanitize('tab\tnewline\n'), 'tabnewline');
});

test('sanitize preserves emoji and CJK', () => {
  assert.strictEqual(sanitize('⚔️ 错虫王 🔥'), '⚔️ 错虫王 🔥');
});

test('sanitize truncates by code point with ellipsis', () => {
  assert.strictEqual(sanitize('abcdef', 3), 'abc…');
  assert.strictEqual(sanitize('错虫王九头蛇', 4), '错虫王九…');
});

test('sanitize handles null/undefined', () => {
  assert.strictEqual(sanitize(null), '');
  assert.strictEqual(sanitize(undefined), '');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/safe-io.test.js`
Expected: FAIL — `sanitize is not a function`

- [ ] **Step 3: Implement in `scripts/lib/hud.js`**

Add above `render()` and export:

```js
// Strip C0/C1 controls (incl. ESC → kills ANSI/OSC); preserve emoji/CJK;
// truncate by code point. Statusline runs on every keystroke — a planted
// escape sequence in any state file would replay into the terminal forever.
function sanitize(s, max = 60) {
  if (s == null) return '';
  const kept = [];
  for (const ch of String(s)) {
    const cp = ch.codePointAt(0);
    if (cp < 0x20 || cp === 0x7f || (cp >= 0x80 && cp <= 0x9f)) continue;
    kept.push(ch);
  }
  if (kept.length > max) return kept.slice(0, max).join('') + '…';
  return kept.join('');
}
```

Change export line to:

```js
module.exports = { render, sanitize };
```

- [ ] **Step 4: Run tests**

Run: `node --test test/safe-io.test.js`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/hud.js test/safe-io.test.js
git commit -m "feat: sanitize() — strip controls/ANSI from terminal-bound strings"
```

---

### Task 3: apply sanitize at render boundaries

**Files:**
- Modify: `scripts/lib/hud.js` (render), `scripts/lib/mapper.js` (target)

- [ ] **Step 1: hud.render — sanitize externally-originated strings**

In `render()`, replace these lines:

```js
  if (snap.inTurn && idleMs > 20000 && tips.length) {
    return tips[Math.floor(now / 20000) % tips.length];
  }

  if (!snap.inTurn) return snap.lastText || T('hud.yourTurn');
```

with:

```js
  if (snap.inTurn && idleMs > 20000 && tips.length) {
    return sanitize(tips[Math.floor(now / 20000) % tips.length], 120);
  }

  if (!snap.inTurn) return sanitize(snap.lastText, 120) || T('hud.yourTurn');
```

and replace:

```js
  if (snap.boss) parts.push(`🗡️ ${snap.boss.name} ${bar(snap.boss.hp)} ${snap.boss.hp}%`);
```

with:

```js
  if (snap.boss) parts.push(`🗡️ ${sanitize(snap.boss.name)} ${bar(snap.boss.hp)} ${snap.boss.hp}%`);
```

and replace:

```js
  if (snap.lastText) parts.push(snap.lastText);
```

with:

```js
  if (snap.lastText) parts.push(sanitize(snap.lastText, 120));
```

- [ ] **Step 2: mapper.target — sanitize the returned fragment**

`target()` builds strings from tool input (file names, patterns, prompts, commands — all user/LLM-originated, later echoed by watch.js and the HUD via `cast.text`). Replace the whole function:

```js
function target(input = {}) {
  const { sanitize } = require('./hud');
  if (input.file_path) return sanitize(path.basename(input.file_path), 40);
  if (input.pattern) return `"${sanitize(input.pattern, 40)}"`;
  if (input.query) return `"${sanitize(input.query, 40)}"`;
  if (input.skill) return sanitize(input.skill, 40);
  if (input.description) return sanitize(input.description, 40);
  if (input.prompt) return sanitize(input.prompt, 40);
  if (input.command) return sanitize(input.command, 40);
  return '';
}
```

(`require` inside the function avoids a hud↔mapper cycle risk and keeps cold-path cost off `hash()` users. The old manual 40-char slice is subsumed by `sanitize(_, 40)`.)

- [ ] **Step 3: Run full suite**

Run: `node --test test/`
Expected: ALL PASS. If `test/mapper.test.js` (or similar) asserts exact `target()` output with `…` truncation, behavior is preserved — sanitize also appends `…` at the cap. Fix only genuine mismatches caused by control chars in fixtures.

- [ ] **Step 4: Commit**

```bash
git add scripts/lib/hud.js scripts/lib/mapper.js
git commit -m "fix: sanitize boss names, tips, tool targets before terminal echo"
```

---

### Task 4: migrate state.js (safe-io + ROOT order + tolerant readEvents)

**Files:**
- Modify: `scripts/lib/state.js`

- [ ] **Step 1: Rewrite `scripts/lib/state.js`** (exports unchanged):

```js
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { safeWrite, safeAppend, readJson, safeMkdir } = require('./safe-io');

// Resolution order mirrors caveman's contract: explicit override, then
// Claude Code's config-dir override, then the default.
const ROOT = process.env.CCQ_ROOT
  || (process.env.CLAUDE_CONFIG_DIR && path.join(process.env.CLAUDE_CONFIG_DIR, 'ccq'))
  || path.join(os.homedir(), '.claude', 'ccq');

function ensureDirs() {
  for (const d of ['sessions', 'bosses', 'reports']) {
    safeMkdir(path.join(ROOT, d));
  }
}

const eventsPath = (id) => path.join(ROOT, 'sessions', `${id}.jsonl`);
const snapshotPath = (id) => path.join(ROOT, 'sessions', `${id}.json`);
const profilePath = () => path.join(ROOT, 'profile.json');
const reportPath = (id) => path.join(ROOT, 'reports', `${id}.txt`);

function appendEvent(id, ev) {
  ensureDirs();
  safeAppend(eventsPath(id), JSON.stringify(ev) + '\n');
}

function readEvents(id) {
  try {
    const out = [];
    for (const l of fs.readFileSync(eventsPath(id), 'utf8').split('\n')) {
      if (!l) continue;
      try { out.push(JSON.parse(l)); } catch { /* skip corrupt line */ }
    }
    return out;
  } catch { return []; }
}

function readSnapshot(id) {
  return readJson(snapshotPath(id), null);
}

function writeSnapshot(id, snap) {
  ensureDirs();
  safeWrite(snapshotPath(id), JSON.stringify(snap));
}

function readProfile() {
  return readJson(profilePath(), null)
    || { milestones: [], totals: { turns: 0, dmg: 0, kills: 0 }, gear: {} };
}

function writeProfile(p) {
  ensureDirs();
  safeWrite(profilePath(), JSON.stringify(p, null, 2));
}

function readStdin() {
  try { return JSON.parse(fs.readFileSync(0, 'utf8')); }
  catch { return null; }
}

module.exports = {
  ROOT, appendEvent, readEvents, readSnapshot, writeSnapshot,
  readProfile, writeProfile, eventsPath, snapshotPath, reportPath, ensureDirs, readStdin,
};
```

- [ ] **Step 2: Append regression test** to `test/safe-io.test.js`:

```js
test('readEvents skips corrupt JSONL lines instead of throwing', () => {
  const d = tmpdir();
  process.env.CCQ_ROOT = d;
  delete require.cache[require.resolve('../scripts/lib/state')];
  const state = require('../scripts/lib/state');
  fs.mkdirSync(path.join(d, 'sessions'), { recursive: true });
  fs.writeFileSync(path.join(d, 'sessions', 's1.jsonl'),
    '{"t":1,"kind":"cast"}\n{CORRUPT\n{"t":2,"kind":"resolve"}\n');
  const evs = state.readEvents('s1');
  assert.strictEqual(evs.length, 2);
  assert.strictEqual(evs[1].t, 2);
  delete process.env.CCQ_ROOT;
  delete require.cache[require.resolve('../scripts/lib/state')];
});
```

- [ ] **Step 3: Run full suite**

Run: `node --test test/`
Expected: ALL PASS (existing suites exercise state.js heavily — any API drift surfaces here).

- [ ] **Step 4: Commit**

```bash
git add scripts/lib/state.js test/safe-io.test.js
git commit -m "fix: state.js through safe-io; CLAUDE_CONFIG_DIR; tolerant readEvents"
```

---

### Task 5: migrate boss.js, usage.js, locale.js

**Files:**
- Modify: `scripts/lib/boss.js`, `scripts/lib/usage.js`, `scripts/lib/locale.js`

- [ ] **Step 1: boss.js** — replace `loadOrCreate` and `save`:

```js
const { safeWrite, readJson } = require('./safe-io');
```
(add to requires at top, keep existing requires)

```js
function loadOrCreate(cwd, prompt, lang) {
  return readJson(bossPath(cwd), null)
    || { name: nameBoss(prompt, cwd, lang), hp: 100, turns: 0, created: Date.now() };
}

function save(cwd, b) {
  state.ensureDirs();
  safeWrite(bossPath(cwd), JSON.stringify(b));
}
```

(`const fs = require('node:fs');` stays — `clear()` still uses `fs.unlinkSync`.)

- [ ] **Step 2: usage.js** — top require + two call sites:

```js
const { safeWrite, readJson } = require('./safe-io');
```

```js
function readCache(root) {
  return readJson(cachePath(root),
    { fiveHour: null, sevenDay: null, contextPct: null, source: null, t: 0 });
}
```

In `cacheFromStatusline`, replace the final write:

```js
  state.ensureDirs();
  safeWrite(cachePath(root), JSON.stringify(next));
```

Remove the now-unused `const fs = require('node:fs');` if no other use remains.

- [ ] **Step 3: locale.js** — top require + two parse sites:

```js
const { readJson } = require('./safe-io');
```

In `current()`:

```js
  const cfg = readJson(path.join(state.ROOT, 'config.json'), {});
  if (cfg.lang) return cfg.lang;
```
(drop the surrounding try/catch for this block — readJson can't throw; keep the second try/catch around profile stats)

In `catalog()`:

```js
function catalog(lang) {
  if (!cache[lang]) {
    cache[lang] = readJson(path.join(CATALOG_DIR, `${lang}.json`), {});
  }
  return cache[lang];
}
```

Remove `const fs = require('node:fs');` if unused after this.

- [ ] **Step 4: Run full suite**

Run: `node --test test/`
Expected: ALL PASS (locale/boss/usage covered by existing suites).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/boss.js scripts/lib/usage.js scripts/lib/locale.js
git commit -m "fix: boss/usage/locale state IO through safe-io"
```

---

### Task 6: hooks + statusline through safe-io

**Files:**
- Modify: `scripts/hook-prompt.js`, `scripts/hook-stop.js`, `scripts/statusline.js`

- [ ] **Step 1: hook-prompt.js** — config read via readJson. Replace:

```js
      const cfgPath = require('node:path').join(state.ROOT, 'config.json');
      let cfg = {};
      try { cfg = JSON.parse(require('node:fs').readFileSync(cfgPath, 'utf8')); } catch {}
```

with:

```js
      const cfgPath = require('node:path').join(state.ROOT, 'config.json');
      const cfg = require('./lib/safe-io').readJson(cfgPath, {});
```

- [ ] **Step 2: hook-stop.js** — report append via safeAppend. Replace:

```js
    state.ensureDirs();
    fs.appendFileSync(state.reportPath(id), card + '\n\n');
```

with:

```js
    state.ensureDirs();
    require('./lib/safe-io').safeAppend(state.reportPath(id), card + '\n\n');
```

Remove `const fs = require('node:fs');` at top (no other use).

- [ ] **Step 3: statusline.js** — tips reads via readJson. Replace the whole tips block (lines 14-28) with:

```js
  const { readJson } = require('./lib/safe-io');
  let tips = [];
  const fallbackTips = path.join(__dirname, '..', 'data', 'tips.json');
  if (lang !== 'en') {
    tips = readJson(path.join(__dirname, '..', 'data', `tips.${lang}.json`), null)
        || readJson(fallbackTips, []);
  } else {
    tips = readJson(fallbackTips, []);
  }
  if (!Array.isArray(tips)) tips = [];
```

Remove `const fs = require('node:fs');` at top (no other use).

- [ ] **Step 4: Run full suite + smoke the statusline**

Run: `node --test test/`
Expected: ALL PASS.

Run: `printf '{"session_id":"smoke"}' | node scripts/statusline.js`
Expected: prints a HUD string (idle text), exit 0, no stack trace.

- [ ] **Step 5: Commit**

```bash
git add scripts/hook-prompt.js scripts/hook-stop.js scripts/statusline.js
git commit -m "fix: hooks and statusline reads/writes through safe-io"
```

---

### Task 7: hook-sessionstart — config-dir aware gear scan

**Files:**
- Modify: `scripts/hook-sessionstart.js`

Note: spec §3 named `CLAUDE_PLUGIN_ROOT`, but that env points at *this plugin's own root*, not the plugins cache; the gear scan lists *all* installed plugins. The correct override is `CLAUDE_CONFIG_DIR`. Deviation recorded here.

- [ ] **Step 1: Replace the cache path line**:

```js
      const cache = path.join(os.homedir(), '.claude', 'plugins', 'cache');
```

with:

```js
      const cache = process.env.CLAUDE_CONFIG_DIR
        ? path.join(process.env.CLAUDE_CONFIG_DIR, 'plugins', 'cache')
        : path.join(os.homedir(), '.claude', 'plugins', 'cache');
```

- [ ] **Step 2: Run suite, commit**

Run: `node --test test/`
Expected: ALL PASS.

```bash
git add scripts/hook-sessionstart.js
git commit -m "fix: gear scan respects CLAUDE_CONFIG_DIR"
```

---

### Task 8: update notifier (spec §7)

**Files:**
- Create: `scripts/lib/update-check.js`
- Modify: `scripts/hook-sessionstart.js`
- Create: `commands/update.md`
- Test: `test/update-check.test.js`
- Modify: `COORDINATION.md` (add the two new files to Session C claims)

- [ ] **Step 1: Write failing test** — `test/update-check.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { checkUpdate } = require('../scripts/lib/update-check');

function git(dir, ...args) {
  return execFileSync('git', ['-C', dir, ...args], { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString().trim();
}

function setupFixture() {
  const cfgDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccq-upd-cfg-'));
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'ccq-upd-repo-'));
  execFileSync('git', ['-C', repo, 'init', '-q']);
  execFileSync('git', ['-C', repo, 'commit', '-q', '--allow-empty', '-m', 'feat: first'],
    { env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
  const sha = git(repo, 'rev-parse', 'HEAD');
  fs.mkdirSync(path.join(cfgDir, 'plugins'), { recursive: true });
  fs.writeFileSync(path.join(cfgDir, 'plugins', 'installed_plugins.json'), JSON.stringify({
    version: 2,
    plugins: { 'questline@questline': [{ scope: 'user', gitCommitSha: sha }] },
  }));
  fs.writeFileSync(path.join(cfgDir, 'settings.json'), JSON.stringify({
    extraKnownMarketplaces: { questline: { source: { source: 'directory', path: repo } } },
  }));
  return { cfgDir, repo };
}

test('checkUpdate returns null when installed == HEAD', () => {
  const { cfgDir } = setupFixture();
  assert.strictEqual(checkUpdate(cfgDir), null);
});

test('checkUpdate lists new commit subjects', () => {
  const { cfgDir, repo } = setupFixture();
  execFileSync('git', ['-C', repo, 'commit', '-q', '--allow-empty', '-m', 'feat: weapon skins'],
    { env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
  const upd = checkUpdate(cfgDir);
  assert.strictEqual(upd.count, 1);
  assert.match(upd.subjects[0], /feat: weapon skins/);
});

test('checkUpdate returns null for non-directory marketplace source', () => {
  const { cfgDir } = setupFixture();
  fs.writeFileSync(path.join(cfgDir, 'settings.json'), JSON.stringify({
    extraKnownMarketplaces: { questline: { source: { source: 'github', repo: 'bitqs/questline' } } },
  }));
  assert.strictEqual(checkUpdate(cfgDir), null);
});

test('checkUpdate silent-nulls on missing files', () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'ccq-upd-empty-'));
  assert.strictEqual(checkUpdate(empty), null);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/update-check.test.js`
Expected: FAIL — `Cannot find module '../scripts/lib/update-check'`

- [ ] **Step 3: Implement `scripts/lib/update-check.js`**:

```js
'use strict';
// update-check — session-start "what's new" for directory-sourced installs.
// GitHub-sourced installs are skipped: no network at session start; the
// official auto-updater covers them. Best-effort: every failure → null.
const { execFileSync } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');
const { readJson } = require('./safe-io');

function git(dir, args) {
  return execFileSync('git', ['-C', dir, ...args], {
    timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'],
  }).toString().trim();
}

// cfgDirOverride is for tests; production callers pass nothing.
function checkUpdate(cfgDirOverride) {
  try {
    const cfgDir = cfgDirOverride
      || process.env.CLAUDE_CONFIG_DIR
      || path.join(os.homedir(), '.claude');
    const installed = readJson(path.join(cfgDir, 'plugins', 'installed_plugins.json'), null);
    const entry = installed && installed.plugins && installed.plugins['questline@questline'];
    const sha = entry && entry[0] && entry[0].gitCommitSha;
    if (!sha) return null;
    const settings = readJson(path.join(cfgDir, 'settings.json'), null);
    const mp = settings && settings.extraKnownMarketplaces && settings.extraKnownMarketplaces.questline;
    if (!mp || !mp.source || mp.source.source !== 'directory' || !mp.source.path) return null;
    const head = git(mp.source.path, ['rev-parse', 'HEAD']);
    if (!head || head === sha) return null;
    const log = git(mp.source.path, ['log', '--oneline', `${sha}..HEAD`]);
    if (!log) return null;
    const lines = log.split('\n');
    return { count: lines.length, subjects: lines.slice(0, 5) };
  } catch { return null; }
}

module.exports = { checkUpdate };
```

- [ ] **Step 4: Run tests**

Run: `node --test test/update-check.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Wire into `scripts/hook-sessionstart.js`** — append inside the outer `try`, after `state.writeSnapshot(...)`:

```js
    // Update notice — display-only systemMessage; Observer Principle intact.
    const upd = require('./lib/update-check').checkUpdate();
    if (upd) {
      const { sanitize } = require('./lib/hud');
      const lines = upd.subjects.map((s) => ` · ${sanitize(s, 80)}`).join('\n');
      process.stdout.write(JSON.stringify({
        systemMessage: `⬆️ Questline update available (${upd.count} commit${upd.count > 1 ? 's' : ''}):\n${lines}\nSay "更新questline" or run /questline:update.`,
      }));
    }
```

(Commit subjects pass through `sanitize` — they render in the user's terminal and are untrusted display input.)

- [ ] **Step 6: Create `commands/update.md`**:

```markdown
---
description: Update Questline to the latest version
allowed-tools: Bash
---

Update the Questline plugin:

1. Run `claude plugin marketplace update questline` (refreshes the marketplace source).
2. Run `claude plugin update questline@questline` (installs the new version).
3. If either command reports what changed, summarize it for the user in their language.
4. Tell the user: restart Claude Code (or start a new session) to load the new version — running sessions keep the old code until then.
```

- [ ] **Step 7: Update COORDINATION.md** — in the Session C claims list, change:

```
- `test/safe-io.test.js` (new), `commands/update.md` (new)
```

to:

```
- `test/safe-io.test.js` (new), `test/update-check.test.js` (new), `commands/update.md` (new), `scripts/lib/update-check.js` (new)
```

- [ ] **Step 8: Run full suite**

Run: `node --test test/`
Expected: ALL PASS.

- [ ] **Step 9: Commit**

```bash
git add scripts/lib/update-check.js scripts/hook-sessionstart.js commands/update.md test/update-check.test.js COORDINATION.md
git commit -m "feat: update notifier — session-start changelog + /questline:update"
```

---

### Task 9: plugin.json metadata

**Files:**
- Modify: `.claude-plugin/plugin.json`

- [ ] **Step 1: Replace contents** (drop `version` deliberately — unpinned means every git commit is a new version, so users on auto-update get every push; spec §4):

```json
{
  "name": "questline",
  "description": "Your work goals are the bosses. Your plugins are your gear. Watch Claude fight — a zero-impact RPG layer over Claude Code.",
  "author": { "name": "qs" },
  "repository": "https://github.com/bitqs/questline",
  "homepage": "https://github.com/bitqs/questline",
  "license": "MIT",
  "keywords": ["game", "rpg", "gamification", "statusline", "hud", "fun"]
}
```

- [ ] **Step 2: Commit**

```bash
git add .claude-plugin/plugin.json
git commit -m "chore: plugin metadata — repo/license/keywords; unpin version for per-commit updates"
```

---

### Task 10: README — install, requirements, uninstall

**Files:**
- Modify: `README.md` (Quick Start section + two new sections; Session B owns only the language-switcher line — re-read the file before editing)

- [ ] **Step 1: Replace the Quick Start section** (currently the `claude plugin install questline` block) with:

````markdown
## Quick Start

```
/plugin marketplace add bitqs/questline
/plugin install questline@questline
```

Then run `/questline:setup` once to enable the HUD, and turn on auto-update so every
improvement reaches you (`/plugin` → Marketplaces → questline → Enable auto-update —
third-party marketplaces ship with it off).

That's it — just work. The game plays itself.
````

- [ ] **Step 2: Add Requirements + Uninstall sections** before the License section:

````markdown
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
````

- [ ] **Step 3: Verify no overlap with Session B's claim**

Run: `git log --oneline -3 -- README.md` and re-read the language-switcher line — leave it untouched.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: real install commands, auto-update nudge, requirements, uninstall"
```

---

### Task 11: full verification

- [ ] **Step 1: Full test suite**

Run: `node --test test/`
Expected: ALL suites pass (13 existing + 2 new).

- [ ] **Step 2: Hook smoke tests** (each must exit 0, no stderr):

```bash
printf '{"session_id":"smoke","prompt":"fix the login bug","cwd":"/tmp/demo"}' | node scripts/hook-prompt.js; echo "prompt:$?"
printf '{"session_id":"smoke","cwd":"/tmp/demo"}' | node scripts/hook-stop.js | head -c 200; echo " stop:$?"
printf '{"session_id":"smoke"}' | node scripts/hook-sessionstart.js; echo "sessionstart:$?"
printf 'NOT JSON' | node scripts/hook-prompt.js; echo "badstdin:$?"
printf '{"session_id":"smoke"}' | node scripts/statusline.js; echo " statusline:$?"
```

Expected: every `:$?` prints `0`. `hook-stop` may print a `{"systemMessage":...}` JSON. Bad stdin prints nothing, exits 0.

- [ ] **Step 3: Symlink attack smoke** (the headline hardening):

```bash
T=$(mktemp -d); export CCQ_ROOT="$T"
mkdir -p "$T/sessions"
echo precious > "$T/victim"
ln -s "$T/victim" "$T/sessions/evil.json"
printf '{"session_id":"evil","prompt":"hi","cwd":"/tmp"}' | node scripts/hook-prompt.js
cat "$T/victim"; unset CCQ_ROOT
```

Expected: prints `precious` (victim untouched), no crash.

- [ ] **Step 4: Commit any stragglers, then update the plan checkboxes**

```bash
git add docs/superpowers/plans/2026-06-07-caveman-hardening.md
git commit -m "docs: hardening plan executed"
```
