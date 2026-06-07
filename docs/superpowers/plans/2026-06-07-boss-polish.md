# Boss System Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the boss polish spec — epithet naming with compressed project names, broken state + auto-defeat at session stop, minion system (todos as killable slimes with HP-drain deaths), CJK est weighting, lang-loss fix, plan-as-feeding growth, and an in-arena game guide.

**Architecture:** All game-state changes flow through `scripts/lib/boss.js` and the hooks (writers); HUD/arena are pure readers. New `minion_down`/`boss_broken` QLEvents and `snap.todos` carry the minion system to consumers. A new `public/minions.js` renders the DOM minion rail; `arena.js` gains broken-pose, feeding, and guide handlers.

**Tech Stack:** Node 20 (zero runtime deps), `node --test`, JSDoc + `tsc --checkJs` strict (arena/minions excluded), PixiJS (vendored) + DOM.

**Spec:** `docs/superpowers/specs/2026-06-07-boss-polish-design.md`

**Conventions for every test task:** test files set `process.env.CCQ_ROOT` to a tmpdir BEFORE requiring any lib, and clean up in `after()`. Hooks are tested by spawning with `execFileSync('node', [script], { input: JSON.stringify(payload), env: ENV })` (see `test/hooks.test.js`).

**One spec deviation (documented):** the arena game guide is a static bilingual overlay (en+zh shown together) hardcoded in `index.html` — the browser/demo worker cannot read `data/locales/*.json`. Locale files still get the new HUD/event keys. README legend is bilingual.

---

### Task 1: `compressName` in boss.js

**Files:**
- Modify: `scripts/lib/boss.js`
- Test: `test/boss.test.js`

- [ ] **Step 1: Write the failing tests** — append to `test/boss.test.js`:

```js
test('compressName: multi-word → initials with digits; single word kept or truncated', () => {
  assert.equal(boss.compressName('/p/my-survivor-game'), 'MSG');
  assert.equal(boss.compressName('/p/2d-three-kindom'), '2TK');
  assert.equal(boss.compressName('/p/questline'), 'Questline');
  assert.equal(boss.compressName('/p/supercalifragilistic'), 'Supercal');
  assert.equal(boss.compressName(''), 'Unknown');
});
```

- [ ] **Step 2: Run** `node --test test/boss.test.js` — expect FAIL: `boss.compressName is not a function`

- [ ] **Step 3: Implement** — in `scripts/lib/boss.js`, below `cap()`:

```js
/** Compress a cwd into a short display base: multi-word dirs → initials
 *  (digits kept), short single words keep their capitalized form, long
 *  single words truncate to 8.
 *  @param {string | null | undefined} cwd @returns {string} */
function compressName(cwd) {
  const raw = (cwd || 'unknown').split(/[\\/]/).filter(Boolean).pop() || 'unknown';
  const words = raw.split(/[-_\s]+/).filter(Boolean);
  if (words.length >= 2) return words.map((w) => w[0].toUpperCase()).join('');
  const w = cap(words[0] || 'unknown');
  return w.length <= 10 ? w : w.slice(0, 8);
}
```

Add `compressName` to `module.exports`.

- [ ] **Step 4: Run** `node --test test/boss.test.js` — expect PASS
- [ ] **Step 5: Commit** `git add scripts/lib/boss.js test/boss.test.js && git commit -m "feat: compressName — short project-name base for boss/minion names"`

### Task 2: Epithet pools + new name formats + slime-form zh types

**Files:**
- Modify: `scripts/lib/boss.js`
- Test: `test/boss.test.js`, `test/hooks.test.js` (fix broken assertions)

- [ ] **Step 1: Write the failing tests** — in `test/boss.test.js` REPLACE the two existing nameBoss tests (`'nameBoss classifies task type…'` and `'zh boss names use…'`) and the `'en nameBoss unchanged without lang'` test with:

```js
test('nameBoss: epithet + compressed base + type, deterministic per prompt', () => {
  const a = boss.nameBoss('fix the login crash', '/p/questline');
  assert.match(a, /^The [A-Za-z-]+ Questline Bugbear$/);
  assert.equal(boss.nameBoss('fix the login crash', '/p/questline'), a); // deterministic
  assert.match(boss.nameBoss('refactor auth', '/p/my-survivor-game'), /^The [A-Za-z-]+ MSG Colossus$/);
  assert.match(boss.nameBoss('whatever else', '/p/web'), /^The [A-Za-z-]+ Web Golem$/);
});

test('nameBoss zh: 「形容词・base」slime-form type', () => {
  assert.match(boss.nameBoss('修复登录bug', '/p/web', 'zh'), /^「.+・Web」错虫史莱姆$/);
  assert.match(boss.nameBoss('重构认证模块', '/p/2d-three-kindom', 'zh'), /^「.+・2TK」重构史莱姆$/);
  assert.match(boss.nameBoss('随便什么', '/p/web', 'zh'), /^「.+・Web」岩石史莱姆$/);
});

test('nameBoss: different prompts of same type can draw different epithets', () => {
  const names = new Set(['a', 'fix b', 'fix cc', 'fix ddd', 'fix eeee', 'fix one more', 'fix again', 'fix x']
    .map((p) => boss.nameBoss('fix ' + p, '/p/web')));
  assert.ok(names.size > 1);
});
```

- [ ] **Step 2: Run** `node --test test/boss.test.js` — expect FAIL (old format returned)

- [ ] **Step 3: Implement** — in `scripts/lib/boss.js` replace `TYPES_ZH` and `nameBoss`:

```js
/** @type {Record<string, string>} */
const TYPES_ZH = {
  Bugbear: '错虫史莱姆',
  Colossus: '重构史莱姆',
  Hydra: '九头史莱姆',
  Wraith: '试炼史莱姆',
  Sphinx: '文档史莱姆',
  Golem: '岩石史莱姆',
};

/** @type {Record<string, string[]>} */
const EPITHETS = {
  Bugbear: ['Rabid', 'Festering', 'Creeping', 'Glitched', 'Howling', 'Venomous', 'Spiteful', 'Crashing'],
  Colossus: ['Ancient', 'Crumbling', 'Towering', 'Rusted', 'Mossbound', 'Forgotten', 'Granite', 'Iron'],
  Hydra: ['Twin-headed', 'Sprouting', 'Ravenous', 'Coiling', 'Emerald', 'Spawning', 'Restless', 'Wild'],
  Wraith: ['Silent', 'Hollow', 'Veiled', 'Moaning', 'Pale', 'Drifting', 'Grim', 'Sleepless'],
  Sphinx: ['Riddling', 'Dusty', 'All-knowing', 'Inkstained', 'Whispering', 'Cryptic', 'Patient', 'Sealed'],
  Golem: ['Nameless', 'Lumbering', 'Mudborn', 'Stitched', 'Waking', 'Blank', 'Heavy', 'Stoneheart'],
};
/** @type {Record<string, string[]>} */
const EPITHETS_ZH = {
  Bugbear: ['狂暴', '溃烂', '潜伏', '错乱', '咆哮', '剧毒', '怨怒', '崩坏'],
  Colossus: ['远古', '崩裂', '擎天', '锈蚀', '苔缚', '遗忘', '花岗', '钢铁'],
  Hydra: ['双首', '增殖', '贪噬', '盘绕', '翠鳞', '滋生', '不眠', '狂野'],
  Wraith: ['无声', '空洞', '蒙面', '哀嚎', '苍白', '游荡', '冷峻', '失眠'],
  Sphinx: ['谜语', '积尘', '全知', '墨染', '低语', '晦涩', '静候', '封印'],
  Golem: ['无名', '蹒跚', '泥生', '缝合', '初醒', '空白', '沉重', '石心'],
};

/** @param {string | null | undefined} prompt @param {string | null | undefined} cwd @param {string} [lang] @returns {string} */
function nameBoss(prompt, cwd, lang) {
  const found = TYPES.find(([re]) => re.test(prompt || ''));
  const type = found ? found[1] : 'Golem';
  const base = compressName(cwd);
  const h = hash(prompt || '');
  if (lang === 'zh') {
    const adj = EPITHETS_ZH[type][h % EPITHETS_ZH[type].length];
    return `「${adj}・${base}」${TYPES_ZH[type]}`;
  }
  const ep = EPITHETS[type][h % EPITHETS[type].length];
  return `The ${ep} ${base} ${type}`;
}
```

(`hash` is already imported from `./mapper` at the top of boss.js.)

- [ ] **Step 4: Fix the hooks test** — in `test/hooks.test.js` replace
`assert.equal(snap.boss.name, 'The Myapp Bugbear');` with
`assert.match(snap.boss.name, /^The [A-Za-z-]+ Myapp Bugbear$/);`

- [ ] **Step 5: Run** `node --test test/boss.test.js test/hooks.test.js` — expect PASS. Also `node --test test/` for strays (commands/report tests may assert boss names — fix the same way if so).
- [ ] **Step 6: Commit** `git commit -am "feat: epithet pools + compressed base; zh types become slime forms"`

### Task 3: `loadOrCreate` lang default (lang-loss fix)

**Files:**
- Modify: `scripts/lib/boss.js`
- Test: `test/boss.test.js`

- [ ] **Step 1: Write the failing test** — append to `test/boss.test.js`:

```js
test('loadOrCreate without lang falls back to locale.current()', () => {
  const localePath = path.join(process.env.CCQ_ROOT, 'locale.json');
  fs.writeFileSync(localePath, JSON.stringify({ lang: 'zh' }));
  const b = boss.loadOrCreate('/p/freshzh', '修复崩溃');
  assert.match(b.name, /史莱姆$/);
  fs.rmSync(localePath, { force: true });
});
```

**Before writing this test:** check how `scripts/lib/locale.js` persists the current language (`locale.current()` source) and adapt the file path/shape above to match — the test must set up whatever `locale.current()` actually reads. If locale state is not a file under `CCQ_ROOT`, stub instead: temporarily monkeypatch `require('../scripts/lib/locale').current` in the test.

- [ ] **Step 2: Run** `node --test test/boss.test.js` — expect FAIL (English Golem name)

- [ ] **Step 3: Implement** — in `boss.js`:

```js
/** @param {string} cwd @param {string | null | undefined} prompt @param {string} [lang] @returns {BossState} */
function loadOrCreate(cwd, prompt, lang) {
  const l = lang || require('./locale').current(); // lazy require avoids cycles
  return readJson(bossPath(cwd), null)
    || { name: nameBoss(prompt, cwd, l), hp: 100, turns: 0, created: Date.now() };
}
```

- [ ] **Step 4: Run** `node --test test/boss.test.js` — expect PASS
- [ ] **Step 5: Commit** `git commit -am "fix: loadOrCreate defaults lang to locale.current() — no more English-Golem recreation for zh users"`

### Task 4: CJK weighting in estimate.js

**Files:**
- Modify: `scripts/lib/estimate.js`
- Test: `test/estimate.test.js`

- [ ] **Step 1: Write the failing test** — append to `test/estimate.test.js` (match its existing import/CCQ_ROOT pattern):

```js
test('CJK chars weigh more than ascii', () => {
  const zh = estimateTokens('重构整个认证模块并补全测试'.repeat(50));
  const en = estimateTokens('refactor auth and add tests'.repeat(50)); // similar char count
  assert.ok(zh > en);
});

test('bounds hold with heavy CJK', () => {
  assert.equal(estimateTokens('改'.repeat(200000)), 900000);
  assert.ok(estimateTokens('') >= 20000); // floor
});
```

- [ ] **Step 2: Run** `node --test test/estimate.test.js` — first test FAILS (equal-length strings currently weigh the same per char… zh string is shorter per repeat so it may pass accidentally — if so, tighten: assert `zh > en * 1.5`)

- [ ] **Step 3: Implement** — replace the body of `estimateTokens`:

```js
/** @param {unknown} text @returns {number} */
function estimateTokens(text) {
  const s = String(text || '');
  const steps = (s.match(/^\s*(?:[-*]|\d+[.)])\s+/gm) || []).length;
  let ascii = 0, cjk = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0) || 0;
    // CJK unified + extensions A, compat ideographs, fullwidth punct range
    if ((cp >= 0x3000 && cp <= 0x9fff) || (cp >= 0xf900 && cp <= 0xfaff)) cjk++;
    else ascii++;
  }
  const est = 25000 + steps * 30000 + ascii * 3 + cjk * 9;
  return Math.max(20000, Math.min(900000, est));
}
```

- [ ] **Step 4: Run** `node --test test/estimate.test.js` — expect PASS
- [ ] **Step 5: Commit** `git commit -am "feat: estimate weighs CJK chars ×9 — zh prompts no longer lowballed"`

### Task 5: Types + locale keys for broken/minion/next

**Files:**
- Modify: `scripts/lib/types.d.ts`, `data/locales/en.json`, `data/locales/zh.json`
- Test: `test/locale.test.js` (only if it asserts key parity — check; if it does, it goes green by itself)

- [ ] **Step 1: types.d.ts** — extend interfaces:

```ts
export interface BossState {
  name: string;
  hp: number;
  turns?: number;
  created?: number;
  named?: boolean;
  broken?: boolean;
}
```

In `Snapshot` add:

```ts
  todos?: Array<{ content: string; status: string; label: string; activeForm?: string; form: number }>;
```

In `QLEvent` add:

```ts
  minion?: string;
  count?: number;
```

- [ ] **Step 2: en.json** — add keys (inside the existing object):

```json
  "boss.broken": "☠ {name} is broken — finish it!",
  "boss.autoDown": "⚡⚡⚡ {name} — DEFEATED ⚡⚡⚡ (milestone #{count})",
  "hud.broken": "🗡️ {name} ☠ broken — /defeat to finish",
  "hud.next": "▶ next: {step}",
  "minion.down": "✄ slain: {minion}",
  "minion.multi": "✄ ×{count} multi-kill!"
```

- [ ] **Step 3: zh.json** — add keys:

```json
  "boss.broken": "☠ {name} 濒死 — 补刀!",
  "boss.autoDown": "⚡⚡⚡ {name} — 击杀!⚡⚡⚡ (里程碑 #{count})",
  "hud.broken": "🗡️ {name} ☠ 濒死 — /defeat 斩杀",
  "hud.next": "▶ 下一步:{step}",
  "minion.down": "✄ 斩杀:{minion}",
  "minion.multi": "✄ ×{count} 连斩!"
```

- [ ] **Step 4: Run** `npm run typecheck && node --test test/locale.test.js` — expect PASS
- [ ] **Step 5: Commit** `git commit -am "feat: types + locale keys for broken state, minion kills, next-step hint"`

### Task 6: `minionLabel` + `recordDefeat` in boss.js; defeat.js reuses recordDefeat

**Files:**
- Modify: `scripts/lib/boss.js`, `scripts/defeat.js`
- Test: `test/boss.test.js`

- [ ] **Step 1: Write the failing tests** — append to `test/boss.test.js`:

```js
test('minionLabel: compressed base + numbered mob, per lang', () => {
  assert.equal(boss.minionLabel('/p/my-survivor-game', 0, 'en'), 'MSG mob 1');
  assert.equal(boss.minionLabel('/p/my-survivor-game', 2, 'zh'), 'MSG·小兵 3');
});

test('recordDefeat: milestone pushed, boss file cleared, count returned', () => {
  const b = boss.loadOrCreate('/p/defeatme', 'fix it');
  boss.save('/p/defeatme', b);
  const n = boss.recordDefeat('/p/defeatme', b);
  assert.ok(n >= 1);
  assert.equal(fs.existsSync(boss.bossPath('/p/defeatme')), false);
  const state = require('../scripts/lib/state');
  const prof = state.readProfile();
  assert.equal(prof.milestones[prof.milestones.length - 1].boss, b.name);
});
```

- [ ] **Step 2: Run** `node --test test/boss.test.js` — expect FAIL (functions missing)

- [ ] **Step 3: Implement** — in `boss.js`:

```js
/** @param {string} cwd @param {number} idx @param {string} [lang] @returns {string} */
function minionLabel(cwd, idx, lang) {
  const base = compressName(cwd);
  return lang === 'zh' ? `${base}·小兵 ${idx + 1}` : `${base} mob ${idx + 1}`;
}

/** Push a milestone for this boss and clear its file. Returns total milestone count.
 *  @param {string} cwd @param {BossState} b @returns {number} */
function recordDefeat(cwd, b) {
  const prof = state.readProfile();
  prof.milestones.push({
    boss: b.name, date: new Date().toISOString().slice(0, 10),
    turns: b.turns || 0, project: cwd,
  });
  state.writeProfile(prof);
  clear(cwd);
  return prof.milestones.length;
}
```

Export both.

- [ ] **Step 4: Refactor `scripts/defeat.js`** — replace the milestone-push + clear block with:

```js
  const b = boss.loadOrCreate(cwd, '');
  const total = boss.recordDefeat(cwd, b);
  const sid = state.newestSessionId();
  if (sid) state.appendEvent(sid, { t: Date.now(), kind: 'boss_down', boss: b.name, text: `⚡⚡⚡ ${b.name} — DEFEATED ⚡⚡⚡` });
  console.log([
    `⚡⚡⚡ ${b.name} — DEFEATED ⚡⚡⚡`,
    `Recorded on the Milestone Wall (${total} total).`,
    `💡 Sage: quest complete — strike camp (/clear) before the next hunt.`,
  ].join('\n'));
```

(Drop the now-unused direct `state.readProfile/writeProfile/boss.clear` calls; keep the existing `fs.existsSync` guard and catch block.)

- [ ] **Step 5: Run** `node --test test/boss.test.js test/commands.test.js` — expect PASS
- [ ] **Step 6: Commit** `git commit -am "feat: minionLabel + recordDefeat lib fns; defeat.js reuses recordDefeat"`

### Task 7: hook-posttool — broken transitions + minion diff + snap.todos

**Files:**
- Modify: `scripts/hook-posttool.js`
- Test: `test/hooks.test.js`

- [ ] **Step 1: Write the failing tests** — append to `test/hooks.test.js`:

```js
test('TodoWrite: completed todos emit minion_down; snap.todos carries rail data', () => {
  run('hook-posttool.js', {
    session_id: 'm1', cwd: '/tmp/my-survivor-game', tool_name: 'TodoWrite',
    tool_input: { todos: [
      { content: 'write tests', activeForm: 'writing tests', status: 'completed' },
      { content: 'fix bug', activeForm: 'fixing bug', status: 'in_progress' },
      { content: 'docs', activeForm: 'writing docs', status: 'pending' },
    ] }, tool_response: {},
  });
  const evs = fs.readFileSync(path.join(ROOT, 'sessions', 'm1.jsonl'), 'utf8')
    .trim().split('\n').map((l) => JSON.parse(l));
  const kills = evs.filter((e) => e.kind === 'minion_down');
  assert.equal(kills.length, 1);
  assert.match(kills[0].minion, /^MSG (mob|·小兵) 1$/u);
  const snap = JSON.parse(fs.readFileSync(path.join(ROOT, 'sessions', 'm1.json'), 'utf8'));
  assert.equal(snap.todos.length, 3);
  assert.equal(snap.todos[1].status, 'in_progress');
  assert.equal(typeof snap.todos[0].form, 'number');
});

test('TodoWrite: re-sending same completed todo emits nothing new', () => {
  run('hook-posttool.js', {
    session_id: 'm1', cwd: '/tmp/my-survivor-game', tool_name: 'TodoWrite',
    tool_input: { todos: [
      { content: 'write tests', activeForm: 'writing tests', status: 'completed' },
      { content: 'fix bug', activeForm: 'fixing bug', status: 'in_progress' },
      { content: 'docs', activeForm: 'writing docs', status: 'pending' },
    ] }, tool_response: {},
  });
  const evs = fs.readFileSync(path.join(ROOT, 'sessions', 'm1.jsonl'), 'utf8')
    .trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(evs.filter((e) => e.kind === 'minion_down').length, 1);
});

test('TodoWrite: >3 fresh kills collapse into one multi-kill event', () => {
  const todos = [1, 2, 3, 4, 5].map((i) => ({ content: `job ${i}`, activeForm: `doing ${i}`, status: 'completed' }));
  run('hook-posttool.js', {
    session_id: 'm2', cwd: '/tmp/web', tool_name: 'TodoWrite',
    tool_input: { todos }, tool_response: {},
  });
  const evs = fs.readFileSync(path.join(ROOT, 'sessions', 'm2.jsonl'), 'utf8')
    .trim().split('\n').map((l) => JSON.parse(l));
  const kills = evs.filter((e) => e.kind === 'minion_down');
  assert.equal(kills.length, 1);
  assert.equal(kills[0].count, 5);
});

test('TodoWrite: hp→0 sets broken and emits boss_broken exactly once; recovery clears it', () => {
  run('hook-posttool.js', {
    session_id: 'm3', cwd: '/tmp/brk', tool_name: 'TodoWrite',
    tool_input: { todos: [{ content: 'a', activeForm: 'a', status: 'completed' }] }, tool_response: {},
  });
  let snap = JSON.parse(fs.readFileSync(path.join(ROOT, 'sessions', 'm3.json'), 'utf8'));
  assert.equal(snap.boss.broken, true);
  // repeat: no second boss_broken
  run('hook-posttool.js', {
    session_id: 'm3', cwd: '/tmp/brk', tool_name: 'TodoWrite',
    tool_input: { todos: [{ content: 'a', activeForm: 'a', status: 'completed' }] }, tool_response: {},
  });
  let evs = fs.readFileSync(path.join(ROOT, 'sessions', 'm3.jsonl'), 'utf8')
    .trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(evs.filter((e) => e.kind === 'boss_broken').length, 1);
  // recovery: new pending todo raises hp, clears broken silently
  run('hook-posttool.js', {
    session_id: 'm3', cwd: '/tmp/brk', tool_name: 'TodoWrite',
    tool_input: { todos: [
      { content: 'a', activeForm: 'a', status: 'completed' },
      { content: 'b', activeForm: 'b', status: 'pending' },
    ] }, tool_response: {},
  });
  snap = JSON.parse(fs.readFileSync(path.join(ROOT, 'sessions', 'm3.json'), 'utf8'));
  assert.equal(snap.boss.broken, false);
  evs = fs.readFileSync(path.join(ROOT, 'sessions', 'm3.jsonl'), 'utf8')
    .trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(evs.filter((e) => e.kind === 'boss_broken').length, 1);
});
```

- [ ] **Step 2: Run** `node --test test/hooks.test.js` — expect FAIL (no minion_down/broken)

- [ ] **Step 3: Implement** — in `scripts/hook-posttool.js`, replace the existing TodoWrite block with:

```js
    if ((p.tool_name || '') === 'TodoWrite' && p.tool_input && p.tool_input.todos && p.cwd) {
      const lang = locale.current();
      const hud = require('./lib/hud');
      const { hash } = require('./lib/mapper');
      const todos = p.tool_input.todos;
      const b = boss.loadOrCreate(p.cwd, '');
      b.hp = boss.hpFromTodos(todos);

      // broken transitions (one-shot event; silent recovery)
      if (b.hp === 0 && !b.broken) {
        b.broken = true;
        state.appendEvent(id, { t: Date.now(), kind: 'boss_broken', boss: b.name,
          text: locale.fmt(locale.t('boss.broken', lang), { name: b.name }) });
      } else if (b.hp > 0 && b.broken) {
        b.broken = false;
      }
      boss.save(p.cwd, b);
      snap.boss = { name: b.name, hp: b.hp, broken: !!b.broken };

      // minion rail snapshot + kill diff
      const list = todos.map((todo, i) => ({
        content: hud.sanitize(todo.content, 80),
        status: String(todo.status || 'pending'),
        label: boss.minionLabel(p.cwd, i, lang),
        activeForm: hud.sanitize(todo.activeForm, 60),
        form: hash(String(todo.content || '')) % 6,
      }));
      const prevDone = new Set((Array.isArray(snap.todos) ? snap.todos : [])
        .filter((t) => t.status === 'completed').map((t) => t.content));
      const fresh = list.filter((t) => t.status === 'completed' && !prevDone.has(t.content));
      if (fresh.length > 3) {
        state.appendEvent(id, { t: Date.now(), kind: 'minion_down',
          minion: fresh[0].label, count: fresh.length,
          text: locale.fmt(locale.t('minion.multi', lang), { count: fresh.length }) });
      } else {
        for (const k of fresh) {
          state.appendEvent(id, { t: Date.now(), kind: 'minion_down', minion: k.label,
            text: locale.fmt(locale.t('minion.down', lang), { minion: k.content }) });
        }
      }
      if (fresh.length) snap.lastText = locale.fmt(locale.t('minion.down', lang), { minion: fresh[fresh.length - 1].content });
      snap.todos = list;
    }
```

(Note: `snap.boss.broken` requires the Snapshot type from Task 5 — `boss?: { name: string; hp: number; broken?: boolean }` — update `types.d.ts` `Snapshot.boss` accordingly in this task if Task 5 didn't already.)

- [ ] **Step 4: Run** `node --test test/hooks.test.js && npm run typecheck` — expect PASS
- [ ] **Step 5: Commit** `git commit -am "feat: broken-state transitions + minion_down kill events + snap.todos rail data"`

### Task 8: hook-stop — auto-defeat while broken

**Files:**
- Modify: `scripts/hook-stop.js`
- Test: `test/hooks.test.js`

- [ ] **Step 1: Write the failing tests** — append to `test/hooks.test.js`:

```js
test('stop hook auto-defeats a broken boss: milestone + boss_down + file gone', () => {
  run('hook-posttool.js', {
    session_id: 's9', cwd: '/tmp/auto', tool_name: 'TodoWrite',
    tool_input: { todos: [{ content: 'a', activeForm: 'a', status: 'completed' }] }, tool_response: {},
  });
  run('hook-stop.js', { session_id: 's9', cwd: '/tmp/auto' });
  const bossLib = require('../scripts/lib/boss');
  assert.equal(fs.existsSync(bossLib.bossPath('/tmp/auto')), false);
  const evs = fs.readFileSync(path.join(ROOT, 'sessions', 's9.jsonl'), 'utf8')
    .trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(evs.filter((e) => e.kind === 'boss_down').length, 1);
  const prof = JSON.parse(fs.readFileSync(path.join(ROOT, 'profile.json'), 'utf8'));
  assert.ok(prof.milestones.some((m) => m.project === '/tmp/auto'));
});

test('stop hook leaves an unbroken boss alone', () => {
  run('hook-prompt.js', { session_id: 's10', prompt: 'fix thing', cwd: '/tmp/alive' });
  run('hook-stop.js', { session_id: 's10', cwd: '/tmp/alive' });
  const bossLib = require('../scripts/lib/boss');
  assert.equal(fs.existsSync(bossLib.bossPath('/tmp/alive')), true);
});
```

- [ ] **Step 2: Run** `node --test test/hooks.test.js` — expect FAIL (boss file persists)

- [ ] **Step 3: Implement** — in `scripts/hook-stop.js`, replace
`if (b && p.cwd) { b.turns = snap.turn || 0; boss.save(p.cwd, b); }` with:

```js
    if (b && p.cwd) {
      b.turns = snap.turn || 0;
      if (b.broken) {
        // all todos done and still broken at stop → confirmed kill, no typing needed
        const total = boss.recordDefeat(p.cwd, b);
        state.appendEvent(id, { t: Date.now(), kind: 'boss_down', boss: b.name,
          text: locale.fmt(locale.t('boss.autoDown', lang), { name: b.name, count: total }) });
        delete snap.boss;
        delete snap.todos;
      } else {
        boss.save(p.cwd, b);
      }
    }
```

(Placement: keep it AFTER `report.render(...)` so the final turn card still shows the boss.)

- [ ] **Step 4: Run** `node --test test/hooks.test.js` — expect PASS
- [ ] **Step 5: Commit** `git commit -am "feat: auto-defeat at session stop — broken boss dies, milestone recorded, no manual /defeat"`

### Task 9: HUD — broken line, kill counter, next-step hint

**Files:**
- Modify: `scripts/lib/hud.js`
- Test: `test/hud.test.js`

- [ ] **Step 1: Write the failing tests** — append to `test/hud.test.js` (match its existing render-call pattern; it passes `snap, stdinJson, tips, now, usageCache, lang` positionally):

```js
test('broken boss renders the finish hint instead of the hp bar', () => {
  const line = hud.render({ sessionId: 'x', turn: 1, combo: 0, kills: 0, dmg: 0, summons: 0,
    inTurn: true, updated: Date.now(), boss: { name: 'The Rabid Web Bugbear', hp: 0, broken: true } },
    null, [], Date.now(), null, 'en');
  assert.match(line, /☠/);
  assert.match(line, /\/defeat/);
});

test('todo counter and next-step hint render from snap.todos', () => {
  const line = hud.render({ sessionId: 'x', turn: 1, combo: 0, kills: 0, dmg: 0, summons: 0,
    inTurn: true, updated: Date.now(), boss: { name: 'B', hp: 50 },
    todos: [
      { content: 'a', status: 'completed', label: 'W mob 1', form: 0 },
      { content: 'b', status: 'in_progress', label: 'W mob 2', activeForm: 'fixing b', form: 1 },
    ] },
    null, [], Date.now(), null, 'en');
  assert.match(line, /⚔1\/2/);
  assert.match(line, /fixing b/);
});
```

- [ ] **Step 2: Run** `node --test test/hud.test.js` — expect FAIL

- [ ] **Step 3: Implement** — in `hud.js render()`, replace the boss line and add the hint after it:

```js
  const todos = Array.isArray(snap.todos) ? snap.todos : [];
  const doneCnt = todos.filter((t) => t.status === 'completed').length;
  const cnt = todos.length ? ` ⚔${doneCnt}/${todos.length}` : '';
  if (snap.boss && snap.boss.broken) {
    parts.push(T('hud.broken', { name: sanitize(snap.boss.name) }) + cnt);
  } else if (snap.boss) {
    parts.push(`🗡️ ${sanitize(snap.boss.name)} ${bar(snap.boss.hp)} ${snap.boss.hp}%${cnt}`);
  }
  const next = todos.find((t) => t.status === 'in_progress') || todos.find((t) => t.status === 'pending');
  if (next) parts.push(T('hud.next', { step: sanitize(next.activeForm || next.content, 40) }));
```

- [ ] **Step 4: Run** `node --test test/hud.test.js && npm run typecheck` — expect PASS
- [ ] **Step 5: Commit** `git commit -am "feat: HUD broken hint, todo kill counter, next-step line"`

### Task 10: Minion rail — `public/minions.js` + index.html + serve.js whitelist

**Files:**
- Create: `public/minions.js`
- Modify: `public/index.html`, `scripts/serve.js`
- Test: `test/serve.test.js` (whitelist), manual eyeball via demo feed

- [ ] **Step 1: Whitelist test** — append to `test/serve.test.js` (match its existing static-file test pattern — it asserts exact-match whitelist entries):

```js
test('serves minions.js from the static whitelist', async () => {
  const res = await get('/minions.js'); // reuse the test file's existing request helper
  assert.equal(res.status, 200);
});
```

- [ ] **Step 2: Run** `node --test test/serve.test.js` — expect FAIL (404)

- [ ] **Step 3: serve.js** — add `'minions.js'` to the exact-match static whitelist next to `arena.js`/`sequencer.js` (same structure already in place — never path-derived reads).

- [ ] **Step 4: Create `public/minions.js`** — DOM rail, no PIXI, no Math.random:

```js
'use strict';
/* Minion rail: renders snap.todos as mini slimes. Pure DOM consumer.
   Style pick comes from t.form (node-side hash) — deterministic. */
(function () {
  // 6 mini slime variants, 8×7: 0=transparent,1=body,2=accent,3=eye
  const SLIME = [
    [0,0,1,1,1,1,0,0],
    [0,1,1,1,1,1,1,0],
    [1,1,3,1,1,3,1,1],
    [1,1,1,1,1,1,1,1],
    [1,2,1,1,1,1,2,1],
    [1,1,1,1,1,1,1,1],
    [0,1,1,1,1,1,1,0],
  ];
  const HORNS = [[2,0],[5,0]]; // extra pixels per variant feature
  const DRIPS = [[1,6],[6,6]];
  const PALETTES = [
    ['', '#6abe30', '#4a8a20', '#1a1d24'], // green
    ['', '#7fa8c0', '#50708a', '#1a1d24'], // steel
    ['', '#f0b541', '#b07820', '#1a1d24'], // gold
    ['', '#c83737', '#8a2020', '#1a1d24'], // red
    ['', '#b070d0', '#7a40a0', '#1a1d24'], // violet
    ['', '#e8e0d0', '#a8a090', '#1a1d24'], // bone
  ];

  function drawSlime(cv, form, dead) {
    const c = cv.getContext('2d');
    c.clearRect(0, 0, cv.width, cv.height);
    const pal = PALETTES[form % PALETTES.length];
    for (let r = 0; r < SLIME.length; r++) {
      for (let x = 0; x < SLIME[r].length; x++) {
        const v = SLIME[r][x];
        if (!v) continue;
        c.fillStyle = dead ? '#3a4050' : pal[v];
        c.fillRect(x, r + 1, 1, 1);
      }
    }
    const extra = form % 3 === 1 ? HORNS : form % 3 === 2 ? DRIPS : [];
    for (const [x, y] of extra) {
      c.fillStyle = dead ? '#3a4050' : pal[1];
      c.fillRect(x, y, 1, 1);
    }
  }

  const railEl = () => document.getElementById('minion-rail');
  let lastKey = '';

  function render(todos) {
    const rail = railEl();
    if (!rail) return;
    const list = Array.isArray(todos) ? todos : [];
    const key = JSON.stringify(list.map((t) => [t.label, t.status]));
    if (key === lastKey) return; // no churn on identical polls
    lastKey = key;
    rail.textContent = '';
    for (const t of list) {
      const card = document.createElement('div');
      card.className = `minion ${t.status}`;
      card.dataset.label = t.label || '';
      const cv = document.createElement('canvas');
      cv.width = 8; cv.height = 8;
      cv.className = 'minion-sprite';
      drawSlime(cv, t.form || 0, t.status === 'completed');
      const hp = document.createElement('div');
      hp.className = 'minion-hp';
      const fill = document.createElement('div');
      fill.className = 'minion-hp-fill';
      fill.style.width = t.status === 'completed' ? '0%' : '100%';
      hp.appendChild(fill);
      const name = document.createElement('div');
      name.className = 'minion-name';
      // in_progress shows what's being done (spec: arena next-step hint); others show the mob label
      name.textContent = t.status === 'in_progress' ? (t.activeForm || t.label || '') : (t.label || '');
      name.title = t.content || '';
      card.append(cv, hp, name);
      if (t.status === 'completed') {
        const grave = document.createElement('div');
        grave.className = 'minion-grave';
        grave.textContent = '🪦';
        card.appendChild(grave);
      }
      rail.appendChild(card);
    }
  }

  /** HP-drain death: bar animates to 0, then card flips to tombstone. */
  function kill(label, calm) {
    const rail = railEl();
    if (!rail) return;
    const card = [...rail.querySelectorAll('.minion')].find((el) => el.dataset.label === label);
    if (!card) return;
    const fill = card.querySelector('.minion-hp-fill');
    if (fill) fill.style.width = '0%'; // CSS transition drains it (instant when .calm)
    const after = () => {
      card.classList.add('completed');
      const cv = card.querySelector('canvas');
      if (cv) {
        const form = 0; // gray-out repaint; form irrelevant once dead
        drawSlime(cv, form, true);
      }
      if (!card.querySelector('.minion-grave')) {
        const grave = document.createElement('div');
        grave.className = 'minion-grave';
        grave.textContent = '🪦';
        card.appendChild(grave);
      }
    };
    if (calm) after(); else setTimeout(after, 450);
  }

  window.QLMinions = { render, kill };
})();
```

- [ ] **Step 5: index.html** — add the rail between `#stage-wrap` and `#stats`:

```html
<div id="minion-rail"></div>
```

CSS (append inside the `<style>` block):

```css
#minion-rail{width:100%;max-width:640px;display:flex;gap:6px;padding:4px 10px;background:#232733;border-top:1px solid #333a4a;min-height:0;overflow-x:auto}
.minion{display:flex;flex-direction:column;align-items:center;gap:2px;position:relative;min-width:52px;padding:2px}
.minion canvas{width:24px;height:24px;image-rendering:pixelated}
.minion.pending{opacity:.45}
.minion.in_progress{outline:1px solid #f0b541}
.minion.completed{opacity:.6}
.minion-hp{width:40px;height:3px;background:#1a1d24;border:1px solid #444}
.minion-hp-fill{height:100%;background:#6abe30;transition:width .4s}
body.calm .minion-hp-fill{transition:none}
.minion-name{font-size:8px;color:#7fa8c0;max-width:60px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.minion-grave{position:absolute;top:0;font-size:12px}
```

Script tag before `arena.js`:

```html
<script src="/minions.js"></script>
```

- [ ] **Step 6: Run** `node --test test/serve.test.js` — expect PASS
- [ ] **Step 7: Commit** `git commit -am "feat: minion rail — todos as mini slimes with HP bars (public/minions.js)"`

### Task 11: arena.js — rail wiring, kill FX + COMBO, broken pose, tier-color override

**Files:**
- Modify: `public/arena.js`, `public/index.html` (calm body class)

- [ ] **Step 1: calm body class** — in `arena.js` right after `const CALM = …` add:

```js
  if (CALM) document.body.classList.add('calm');
```

- [ ] **Step 2: rail wiring in applyState** — inside the `if (snap) {` branch add:

```js
      if (window.QLMinions) QLMinions.render(snap.todos);
```

and in the `else` branch (no session):

```js
      if (window.QLMinions) QLMinions.render([]);
```

- [ ] **Step 3: broken pose state + helpers** — near `let bossDead = false;` add:

```js
  let bossBroken = false;
  let lockedTierColor = '#e8e0d0';
  const finishText = new PIXI.Text({ text: '⚔ FINISH ⚔', style: { fontFamily: 'monospace',
    fontSize: 10, fontWeight: 'bold', fill: 0xc83737, align: 'center' } });
  finishText.anchor.set(0.5);
  finishText.x = 238; finishText.y = 100; finishText.visible = false;
  uiLayer.addChild(finishText);
  function setBroken(on) {
    bossBroken = on;
    boss.tint = on ? 0x777777 : 0xffffff;
    finishText.visible = on;
    const nameEl = document.getElementById('boss-name');
    if (nameEl) nameEl.style.color = on ? '#777777' : lockedTierColor;
  }
```

In the ticker (next to the danger-pulse block) add the pulse:

```js
    if (finishText.visible) finishText.alpha = CALM ? 1 : 0.6 + Math.sin(frame / 8) * 0.4;
```

In the bob block, slump the broken boss 3px lower: change the boss bob line to:

```js
      if (!fx.bossFalling) boss.y = FLOOR_Y - 14 + (bossBroken ? 3 : 0) - (boss.y < FLOOR_Y - 14 + (bossBroken ? 3 : 0) ? 0 : 1);
```

- [ ] **Step 4: event handlers** — in the first `QLArena.on((d) => { … })` block where `encounter`/`boss_down` live:

In the `encounter` isNew branch, replace `document.getElementById('boss-name').style.color = tier.color;` with:

```js
        lockedTierColor = tier.color;
        document.getElementById('boss-name').style.color = tier.color;
        setBroken(false);
```

Add new kinds:

```js
    if (d.kind === 'boss_broken') { setBroken(true); PRIM.shake({ amp: 2, frames: 8 }); if (d.text) pushLog(d.text); }
    if (d.kind === 'minion_down') {
      if (window.QLMinions) QLMinions.kill(d.minion, CALM);
      burst(238, 125, P.bone, d.count ? 18 : 8);
      PRIM.flash({ strength: 0.35 });
      minionStreak = (d.count || 1) + (Date.now() - lastMinionKill < 8000 ? minionStreak : 0);
      lastMinionKill = Date.now();
      if (minionStreak >= 2) {
        PRIM.bigtext({ text: `COMBO ×${minionStreak}`, y: 50 });
        setTimeout(() => PRIM.hidetext(), 1400);
      }
      if (d.text) pushLog(d.text);
    }
```

with state vars near `let pendingEst`:

```js
  let minionStreak = 0;
  let lastMinionKill = 0;
```

In the `boss_down` handler add `setBroken(false);` before `playScene(SCENE_VICTORY(d.boss))`.

- [ ] **Step 5: poll-path broken sync** — in `applyState`, after the tier/texture update add:

```js
      if (snap.boss && typeof snap.boss.broken === 'boolean' && snap.boss.broken !== bossBroken) setBroken(snap.boss.broken);
```

- [ ] **Step 6: Eyeball** — `CCQ_ROOT=/tmp/ccq-demo node scripts/demo-feed.js & CCQ_ROOT=/tmp/ccq-demo QL_PORT=4118 node scripts/serve.js` → open http://127.0.0.1:4118 and `?calm=1`. Verify rail renders, no console errors (demo feed gains minion beats in Task 14).
- [ ] **Step 7: Commit** `git commit -am "feat: arena minion kills + COMBO streak, broken pose with FINISH pulse, tier-color override"`

### Task 12: arena.js — scene system (FEEDING / BATTLE / SETTLEMENT) + plan-as-feeding

**Files:**
- Modify: `public/arena.js`, `public/index.html`

Three presentation scenes switched by existing events — no hook changes.
FEEDING: plan phase, baby slime grows toward boss size as it is fed.
BATTLE: default (knight vs boss + rail). With no plan, encounters go straight
here. SETTLEMENT: brief results card on `turn_end`; victory cutscene on
`boss_down` doubles as settlement.

- [ ] **Step 1: counter DOM** — in `index.html` inside `#canvas-wrap` add:

```html
<div id="feed-counter"></div>
```

CSS:

```css
#feed-counter{position:absolute;right:8px;bottom:26px;font-size:10px;color:#f0b541;text-shadow:1px 1px #000;display:none;z-index:3}
```

- [ ] **Step 2: scene state + feeding logic** — in `arena.js` near `let pendingEst`:

```js
  // ── scene system: 'battle' | 'feeding' | 'settle' ─────────────────────────────
  let scene = 'battle';
  let bossScaleTarget = null; // feeding growth tween target
  let lastFedEst = null;
  function setScene(next) {
    if (scene === next) return;
    scene = next;
    const counter = document.getElementById('feed-counter');
    if (next === 'feeding') {
      PRIM.dim({ on: true });
      // baby slime: if no engaged boss yet, show the boss sprite tiny — it IS the creature being fed
      if (!engagedBoss) { bossDead = false; boss.visible = true; boss.scale.set(0.5); boss.x = 220 + 8; }
      if (counter) counter.style.display = 'block';
    } else {
      PRIM.dim({ on: false });
      if (counter) counter.style.display = 'none';
      if (next === 'battle') { lastFedEst = null; }
    }
  }
  function feedBeat(est, small) {
    setScene('feeding');
    const tier = bossTierFor(est);
    bossScaleTarget = small ? Math.min((boss.scale.x || 0.5) + 0.06, tier.scale) : tier.scale;
    const delta = !small && lastFedEst != null ? est - lastFedEst : null;
    if (!small) lastFedEst = est;
    const counter = document.getElementById('feed-counter');
    if (counter && est != null) {
      counter.textContent = `≈${fmtTokensJs(est).slice(1)} tokens${tier.label && tier.label !== 'normal' ? ' · ' + tier.label : ''}`;
    }
    if (delta && delta > 0) floater(`+${fmtTokensJs(delta)}`, boss.x + 8, boss.y - 10, P.gold, 9, true);
    if (CALM) { boss.scale.set(bossScaleTarget); bossScaleTarget = null; return; }
    // morsel arc: knight → slime
    const n = small ? 3 : 6;
    for (let i = 0; i < n; i++) {
      fx.particles.push({ x: knight.x + 10, y: knight.y + 4,
        vx: 2.2 + i * 0.15, vy: -2 - i * 0.1, age: 0, maxAge: 60, color: colorNum(P.gold) });
    }
    PRIM.zoom({ scale: 1.04, frames: 6 }); // munch wobble
  }
```

In the ticker add the scale tween (next to knight lunge decay):

```js
    if (bossScaleTarget != null) {
      const s = boss.scale.x + (bossScaleTarget - boss.scale.x) * 0.06;
      boss.scale.set(s);
      boss.x = 220 - (s - 1) * 8;
      if (Math.abs(s - bossScaleTarget) < 0.01) { boss.scale.set(bossScaleTarget); bossScaleTarget = null; }
    }
```

- [ ] **Step 3: scene transitions in event handlers** —

In the second `QLArena.on` block (choice/plan overlays):

```js
    if (d.kind === 'choice_open') { setScene('feeding'); openChoices(d.questions || []); }
    if (d.kind === 'choice_made') {
      resolveChoices(d.chosen || []);
      if (scene === 'feeding') feedBeat(lastFedEst, true); // Q&A morsel: small grow toward current target
    }
    if (d.kind === 'plan_scroll') {
      openPlan(d.plan || '');
      if (d.est != null) { pendingEst = d.est; feedBeat(d.est, false); }
    }
    if (d.kind === 'plan_approved') {
      approvePlan();
      lastFedEst = null;
      if (pendingEst != null) {
        const tier = bossTierFor(pendingEst);
        lockedTierColor = tier.color;
        const nameEl = document.getElementById('boss-name');
        if (nameEl && !bossBroken) nameEl.style.color = tier.color;
        playScene(SCENE_FORGE(pendingEst));
        pendingEst = null;
      }
      setScene('battle');
    }
```

(This REPLACES the existing `choice_open`/`choice_made`/`plan_scroll`/`plan_approved` lines; `closeOverlays()` keeps handling overlay teardown.)

In the FIRST `QLArena.on` block:
- `encounter` isNew branch: add `setScene('battle');` first line — no plan means feeding never showed; with a plan the fed scale carries (tier.scale set as today).
- `boss_down`: before `playScene(SCENE_VICTORY(d.boss))` add `setScene('battle');` (victory cutscene = settlement flourish).
- `turn_end` handler (in `handleEvent`): wrap the existing bigtext in a settle beat — replace the body with:

```js
    if (d.kind === 'turn_end') {
      const line = (d.text || '').split('\n')[0];
      if (line) {
        setScene('settle');
        PRIM.letterbox({ on: true });
        PRIM.bigtext({ text: line.slice(0, 40), y: H / 2 });
        setTimeout(() => { PRIM.hidetext(); PRIM.letterbox({ on: false }); setScene('battle'); }, 2000);
        pushLog(line);
      }
    }
```

- [ ] **Step 4: Eyeball** — demo feed emits `choice_open`/`choice_made`/`plan_scroll`/`plan_approved` beats (`scripts/demo-feed.js`): rerun Task 11 eyeball commands and confirm — Q&A dims stage + baby slime appears small, each answer/plan beat lobs morsels and the slime tweens bigger with the live counter, approval forges then snaps to battle, turn_end shows the letterboxed settle card for ~2s; `?calm=1` does instant scale sets.
- [ ] **Step 5: Commit** `git commit -am "feat: arena scenes (feeding/battle/settle) — plan+Q&A feed a baby slime up to boss size"`

### Task 12b: arena.js — encounter forms (mini / big / pack / tentacled)

**Files:**
- Modify: `public/arena.js`

The creature's stage form derives from (est tier, todo count) — spec §5 table.
Presentation-only; re-evaluated on encounter, on poll (`applyState`), and on
`minion_down`.

- [ ] **Step 1: form state + sprites** — near the boss sprite setup add:

```js
  // ── encounter forms ──────────────────────────────────────────────────────────
  let encForm = 'big';          // 'mini' | 'big' | 'pack' | 'tentacled'
  let lastEncEst = null;        // est used for form decisions (locked at encounter/approval)
  const packSprites = [];       // PIXI sprites, one per todo (cap 5)
  const PACK_X = [180, 205, 230, 255, 280];
  const tentacleGfx = new PIXI.Graphics();
  world.addChild(tentacleGfx);

  function encounterFormFor(est, todoCount) {
    const tier = bossTierFor(est);
    const big = tier.label === 'ELITE' || tier.label === 'RAID BOSS';
    if (!big) return todoCount >= 2 ? 'pack' : 'mini';
    return todoCount >= 3 ? 'tentacled' : 'big';
  }

  function drawTentacles(aliveCount) {
    tentacleGfx.clear();
    if (encForm !== 'tentacled' || bossDead) return;
    const n = Math.min(6, aliveCount);
    for (let i = 0; i < n; i++) {
      // pixel arms fanning from the boss base
      const bx = boss.x + 2 + i * (boss.width - 4) / Math.max(1, n - 1);
      const sway = CALM ? 0 : Math.sin(frame / 14 + i) * 2;
      tentacleGfx.rect(bx + sway, FLOOR_Y - 4, 2, 4).fill(colorNum(bossColors(50)[1]));
      tentacleGfx.rect(bx + sway * 1.5, FLOOR_Y - 8, 2, 4).fill(colorNum(bossColors(50)[1]));
    }
  }

  function applyForm(todos, est) {
    const list = Array.isArray(todos) ? todos : [];
    if (est != null) lastEncEst = est;
    const next = encounterFormFor(lastEncEst, list.length);
    encForm = next;
    const alive = list.filter((t) => t.status !== 'completed');
    if (next === 'pack') {
      boss.visible = false;
      // one mini slime per todo (cap 5); completed ones stay hidden
      while (packSprites.length < Math.min(5, list.length)) {
        const s = new PIXI.Sprite(bossTexFor(100).tex);
        s.scale.set(0.35);
        s.x = PACK_X[packSprites.length]; s.y = FLOOR_Y - 6;
        world.addChild(s);
        packSprites.push(s);
      }
      packSprites.forEach((s, i) => { s.visible = i < list.length && list[i].status !== 'completed'; });
    } else {
      packSprites.forEach((s) => { s.visible = false; });
      if (!bossDead) boss.visible = true;
      if (next === 'mini') { boss.scale.set(0.5); boss.x = 228; }
      // 'big'/'tentacled' keep tier scale (encounter/feeding set it)
    }
    drawTentacles(alive.length);
  }
```

In the ticker (after the torch flicker line) keep tentacles swaying:

```js
    if (encForm === 'tentacled' && frame % 4 === 0) {
      // redraw with current alive count from the last rail render
      const railCards = document.querySelectorAll('#minion-rail .minion:not(.completed)');
      drawTentacles(railCards.length);
    }
```

- [ ] **Step 2: wire the re-evaluation points** —
  - `applyState`, inside `if (snap)` after `QLMinions.render(snap.todos)`: add `applyForm(snap.todos, null);`
  - `encounter` isNew branch, after the existing `boss.scale.set(tier.scale)` lines: add `applyForm(window.__lastTodos || [], est);` — and to keep a todo cache, in `applyState` set `window.__lastTodos = snap.todos || [];`
  - `minion_down` handler: pack form → burst the matching slime instead of the boss anchor. Replace the existing `burst(238, 125, …)` line with:

```js
      if (encForm === 'pack') {
        const idx = packSprites.findIndex((s) => s.visible);
        if (idx >= 0) { burst(packSprites[idx].x + 3, packSprites[idx].y + 3, P.bone, 10); packSprites[idx].visible = false; }
      } else if (encForm === 'tentacled') {
        burst(boss.x + boss.width / 2, FLOOR_Y - 6, P.bone, 10); // severed tentacle falls
      } else {
        burst(238, 125, P.bone, d.count ? 18 : 8);
      }
```

  - `boss_down`: add `packSprites.forEach((s) => { s.visible = false; }); tentacleGfx.clear();`
  - broken pose (`setBroken`): pack form grays the pack — add `packSprites.forEach((s) => { s.tint = on ? 0x777777 : 0xffffff; });`

- [ ] **Step 3: Eyeball** — demo feed: confirm form picks per the spec table (tweak demo est/todos to hit all four: mini, big, pack, tentacled), tentacles sway and shrink as todos complete, pack slimes burst one by one; `?calm=1` = no sway.
- [ ] **Step 4: Commit** `git commit -am "feat: encounter forms — mini/big slime, slime pack, tentacled raid boss from est+todos"`

### Task 13: Game guide overlay + README legend

**Files:**
- Modify: `public/index.html`, `public/arena.js`, `README.md`

- [ ] **Step 1: index.html** — help button in `#top-bar` (after `#player-token`):

```html
<button id="help-btn" title="game guide (h)">?</button>
```

Guide overlay inside `#canvas-wrap` (static authored content — bilingual, no user input, so plain HTML is safe; pattern note in spec deviation header):

```html
<div id="guide-overlay">
  <div id="guide-box">
    <b>⚔️ How to read the battle · 怎么看懂这场仗</b>
    <p>🗡️ <b>Boss</b> — your current quest in this project. Forged from your prompt; its size/tier comes from the estimated token cost. <i>Boss=当前任务,体型=预估 token 量。</i></p>
    <p>❤️ <b>Boss HP</b> — falls as todos get checked off. At 0 the boss kneels (☠ broken); it dies automatically when the session stops. <i>todo 全勾=濒死,停机自动击杀,免打字。</i></p>
    <p>🟢 <b>Minions</b> — the todo list. Each completed todo drains a slime's HP to zero. <i>小怪=todo,做完一只死一只。</i></p>
    <p>⚡ <b>Token</b> — your resource (5h rate window). Rest restores it. <i>Token=你的资源,休息回复。</i></p>
    <p>🔥 <b>Combo</b> — consecutive successful tool strikes. <i>连击=连续成功操作。</i></p>
    <p>🍖 <b>Feeding</b> — while planning, every plan update feeds the boss and it grows. <i>计划越喂越大。</i></p>
    <p>Commands: <code>/questline:arena</code> · <code>/questline:defeat</code> · <code>/questline:milestones</code> · <code>/questline:wrapped</code></p>
    <p id="guide-close-hint">esc / click to close</p>
  </div>
</div>
```

CSS:

```css
#help-btn{flex-shrink:0;background:#232733;color:#f0b541;border:1px solid #f0b541;font-family:monospace;font-size:11px;width:18px;height:18px;cursor:pointer}
#guide-overlay{position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(26,29,36,.92);z-index:30}
#guide-box{max-width:85%;max-height:90%;overflow:auto;font-size:10px;line-height:1.5;color:#e8e0d0;background:#232733;border:2px solid #f0b541;padding:10px}
#guide-box b{color:#f0b541}
#guide-box code{color:#7fa8c0}
#guide-close-hint{color:#7fa8c0;text-align:center;margin-top:4px}
```

- [ ] **Step 2: arena.js toggle** — at the end of the IIFE:

```js
  // ── game guide ────────────────────────────────────────────────────────────────
  const guideEl = document.getElementById('guide-overlay');
  function toggleGuide(force) {
    if (!guideEl) return;
    const show = force != null ? force : guideEl.style.display !== 'flex';
    guideEl.style.display = show ? 'flex' : 'none';
  }
  const helpBtn = document.getElementById('help-btn');
  if (helpBtn) helpBtn.addEventListener('click', () => toggleGuide());
  if (guideEl) guideEl.addEventListener('click', () => toggleGuide(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'h') toggleGuide();
    if (e.key === 'Escape') toggleGuide(false);
  });
```

- [ ] **Step 3: README** — add a "How to read the battle" section after the demo link: one bilingual table mapping Boss/HP/Minions/Token/Combo/Feeding to their meanings (mirror the guide copy above).

- [ ] **Step 4: Eyeball** — rerun demo serve; click `?`, press `h`, press `Esc`; check demo worker locally if convenient (`cd demo && npx wrangler dev`) — static files only, no new endpoints.
- [ ] **Step 5: Commit** `git commit -am "feat: in-arena game guide (? / h) + README battle legend"`

### Task 14: demo-feed minion + broken + auto-kill beats

**Files:**
- Modify: `scripts/demo-feed.js`

- [ ] **Step 1: Read `scripts/demo-feed.js` fully** (62-line script; events via the `ev({…})` helper, snapshot via its existing write path). Add to the show sequence, after the plan beats:
  - a snapshot update with `todos`: 3 entries shaped `{ content, status, label: 'QL mob N', activeForm, form: N }` (statuses pending/in_progress/completed)
  - `ev({ kind: 'minion_down', minion: 'QL mob 1', text: '✄ slain: sharpen the demo' })`
  - later: all todos completed + `ev({ kind: 'boss_broken', boss: <demo boss name>, text: '☠ broken — finish it!' })`
  - finally the existing `boss_down` beat doubles as the auto-kill.
- [ ] **Step 2: Eyeball** — rerun demo feed + serve; rail fills, slime drains on kill, boss kneels gray with FINISH pulse, victory plays.
- [ ] **Step 3: Commit** `git commit -am "feat: demo feed shows minion kills, broken kneel, auto-kill finale"`

### Task 15: Full verification + spec/docs sync

- [ ] **Step 1:** `node --test test/` — ALL pass (expect ~110+; zero failures)
- [ ] **Step 2:** `npm run typecheck` — clean
- [ ] **Step 3:** Re-read the spec top to bottom; tick every requirement against the diff (`git diff <first-task-commit>^..HEAD --stat`). Update `CLAUDE.md` if any architecture statement changed (new `public/minions.js` consumer belongs in the architecture diagram line for serve.js whitelist).
- [ ] **Step 4:** Final commit `git commit -am "docs: CLAUDE.md — minion rail consumer + whitelist note"` (only if docs changed)
