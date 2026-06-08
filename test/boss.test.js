const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.SLIME_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'slime-'));
const boss = require('../scripts/lib/boss');

test('nameBoss: epithet + compressed base + type, deterministic per prompt', () => {
  const a = boss.nameBoss('fix the login crash', '/p/slime');
  assert.match(a, /^The [A-Za-z-]+ Slime Bugbear$/);
  assert.equal(boss.nameBoss('fix the login crash', '/p/slime'), a); // deterministic
  assert.match(boss.nameBoss('refactor auth', '/p/my-survivor-game'), /^The [A-Za-z-]+ MSG Colossus$/);
  assert.match(boss.nameBoss('whatever else', '/p/web'), /^The [A-Za-z-]+ Web Golem$/);
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
  assert.equal(boss.compressName('/p/slime'), 'Slime');
  assert.equal(boss.compressName('/p/supercalifragilistic'), 'Supercal');
  assert.equal(boss.compressName(''), 'Unknown');
});

test('loadOrCreate with no lang arg defaults to locale.current()', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'slime-locale-'));
  // Set locale to 'zh' via config.json
  fs.mkdirSync(path.join(tmpRoot, 'bosses'), { recursive: true });
  fs.writeFileSync(path.join(tmpRoot, 'config.json'), JSON.stringify({ lang: 'zh' }));

  const stateModule = require('../scripts/lib/state');
  const origRoot = stateModule.ROOT;

  try {
    // Monkeypatch state.ROOT for this test
    Object.defineProperty(stateModule, 'ROOT', { value: tmpRoot, configurable: true });

    // Now load the boss module fresh with the new ROOT
    delete require.cache[require.resolve('../scripts/lib/boss')];
    delete require.cache[require.resolve('../scripts/lib/locale')];
    const freshBoss = require('../scripts/lib/boss');

    const b = freshBoss.loadOrCreate('/p/freshzh', '修复崩溃');
    assert.match(b.name, /史莱姆$/, `Expected zh slime name, got: ${b.name}`);
  } finally {
    // Restore state.ROOT
    Object.defineProperty(stateModule, 'ROOT', { value: origRoot, configurable: true });
    delete require.cache[require.resolve('../scripts/lib/boss')];
    delete require.cache[require.resolve('../scripts/lib/locale')];

    // Cleanup
    fs.rmSync(tmpRoot, { recursive: true });
  }
});

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
