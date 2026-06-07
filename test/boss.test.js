const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.CCQ_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'ccq-'));
const boss = require('../scripts/lib/boss');

test('nameBoss: epithet + compressed base + type, deterministic per prompt', () => {
  const a = boss.nameBoss('fix the login crash', '/p/questline');
  assert.match(a, /^The [A-Za-z-]+ Questline Bugbear$/);
  assert.equal(boss.nameBoss('fix the login crash', '/p/questline'), a); // deterministic
  assert.match(boss.nameBoss('refactor auth', '/p/my-survivor-game'), /^The [A-Za-z-]+ MSG Colossus$/);
  assert.match(boss.nameBoss('whatever else', '/p/web'), /^The [A-Za-z-]+ Web Golem$/);
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
  assert.match(b.name, /^The [A-Za-z-]+ Web Hydra$/);
  b.hp = 40;
  boss.save('/p/web', b);
  assert.equal(boss.loadOrCreate('/p/web', 'ignored').hp, 40);
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

test('compressName: multi-word → initials with digits; single word kept or truncated', () => {
  assert.equal(boss.compressName('/p/my-survivor-game'), 'MSG');
  assert.equal(boss.compressName('/p/2d-three-kindom'), '2TK');
  assert.equal(boss.compressName('/p/questline'), 'Questline');
  assert.equal(boss.compressName('/p/supercalifragilistic'), 'Supercal');
  assert.equal(boss.compressName(''), 'Unknown');
});

test('loadOrCreate with no lang arg defaults to locale.current()', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ccq-locale-'));
  // Set locale to 'zh' via config.json
  fs.mkdirSync(path.join(tmpRoot, 'bosses'), { recursive: true });
  fs.writeFileSync(path.join(tmpRoot, 'config.json'), JSON.stringify({ lang: 'zh' }));

  // Monkeypatch state.ROOT for this test
  const stateModule = require('../scripts/lib/state');
  const origRoot = stateModule.ROOT;
  Object.defineProperty(stateModule, 'ROOT', { value: tmpRoot, configurable: true });

  // Now load the boss module fresh with the new ROOT
  delete require.cache[require.resolve('../scripts/lib/boss')];
  delete require.cache[require.resolve('../scripts/lib/locale')];
  const freshBoss = require('../scripts/lib/boss');

  const b = freshBoss.loadOrCreate('/p/freshzh', '修复崩溃');
  assert.match(b.name, /史莱姆$/, `Expected zh slime name, got: ${b.name}`);

  // Restore state.ROOT
  Object.defineProperty(stateModule, 'ROOT', { value: origRoot, configurable: true });
  delete require.cache[require.resolve('../scripts/lib/boss')];
  delete require.cache[require.resolve('../scripts/lib/locale')];

  // Cleanup
  fs.rmSync(tmpRoot, { recursive: true });
});
