const { test } = require('node:test');
const assert = require('node:assert');
const prog = require('../core/progression');

test('levelFor: thresholds 50·n·(n-1) — L1:0 L2:100 L3:300 L4:600 L5:1000', () => {
  assert.equal(prog.levelFor(0).level, 1);
  assert.equal(prog.levelFor(99).level, 1);
  assert.equal(prog.levelFor(100).level, 2);
  assert.equal(prog.levelFor(299).level, 2);
  assert.equal(prog.levelFor(300).level, 3);
  assert.equal(prog.levelFor(600).level, 4);
  assert.equal(prog.levelFor(1000).level, 5);
});

test('levelFor: titles band by level', () => {
  assert.equal(prog.levelFor(prog.xpToReach(1)).titleKey, 'title.novice');
  assert.equal(prog.levelFor(prog.xpToReach(3)).titleKey, 'title.apprentice');
  assert.equal(prog.levelFor(prog.xpToReach(6)).titleKey, 'title.adept');
  assert.equal(prog.levelFor(prog.xpToReach(10)).titleKey, 'title.veteran');
  assert.equal(prog.levelFor(prog.xpToReach(15)).titleKey, 'title.master');
  assert.equal(prog.levelFor(prog.xpToReach(21)).titleKey, 'title.grandmaster');
});

test('levelFor: nextAt / intoLevel / span are consistent', () => {
  const r = prog.levelFor(150); // L2 (base 100, next 300)
  assert.equal(r.level, 2);
  assert.equal(r.nextAt, 300);
  assert.equal(r.intoLevel, 50);
  assert.equal(r.span, 200);
});

test('levelFor: tolerant of junk input', () => {
  assert.equal(prog.levelFor(undefined).level, 1);
  assert.equal(prog.levelFor(-50).level, 1);
  assert.equal(prog.levelFor('nope').level, 1);
});

test('xpForDefeat: 50 base + dmg + kills·20 + maxCombo·5', () => {
  assert.equal(prog.xpForDefeat({}), 50);
  assert.equal(prog.xpForDefeat({ dmg: 42, kills: 3, maxCombo: 7 }), 50 + 42 + 60 + 35);
  assert.equal(prog.xpForDefeat(), 50);
});
