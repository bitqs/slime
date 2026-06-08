const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.SLIME_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'slime-'));
after(() => fs.rmSync(process.env.SLIME_ROOT, { recursive: true, force: true }));
const locale = require('../scripts/lib/locale');
const state = require('../scripts/lib/state');

test('classify detects zh and en', () => {
  assert.equal(locale.classify('修复登录崩溃的bug'), 'zh');
  assert.equal(locale.classify('fix the login crash'), 'en');
  assert.equal(locale.classify('12345 !!!'), null);
});

test('tally majority decides current()', () => {
  locale.tally('修复bug');
  locale.tally('添加功能');
  locale.tally('fix typo');
  assert.equal(locale.current(), 'zh');
});

test('config lang overrides majority', () => {
  state.ensureDirs();
  fs.writeFileSync(path.join(state.ROOT, 'config.json'), '{"lang":"en"}');
  assert.equal(locale.current(), 'en');
  fs.unlinkSync(path.join(state.ROOT, 'config.json'));
});

test('t falls back to en then key', () => {
  assert.equal(locale.t('hud.idle', 'en'), '🟢 Slime — awaiting first encounter');
  assert.match(locale.t('hud.idle', 'zh'), /等待/);
  assert.equal(locale.t('no.such.key', 'zh'), 'no.such.key');
});

test('fmt interpolates', () => {
  assert.equal(locale.fmt('Turn {n} — {r}', { n: 3, r: 'S' }), 'Turn 3 — S');
});

test('zh report renders zh labels', () => {
  const report = require('../scripts/lib/report');
  const txt = report.render(
    { dmg: 5, kills: 1, hits: 0, maxCombo: 2 },
    { name: 'The Web Hydra', hp: 15 },
    { turn: 3 },
    { lang: 'zh' }
  );
  assert.match(txt, /回合 #3/);
  assert.match(txt, /伤害 5/);
  assert.match(txt, /摇摇欲坠/);
});
