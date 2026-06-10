const { test } = require('node:test');
const assert = require('node:assert');
const { estimateTokens, fmtTokens } = require('../core/estimate');

test('base estimate for tiny text is the floor', () => {
  assert.equal(estimateTokens(''), 15000);
  assert.equal(estimateTokens('fix typo'), 15000 + 'fix typo'.length * 4);
});

test('each plan step adds 12k', () => {
  const plan = '1. slay dragon\n2. loot hoard\n- profit';
  const base = 15000 + plan.length * 4;
  assert.equal(estimateTokens(plan), base + 3 * 12000);
});

test('clamped to 900k', () => {
  const huge = ('- step\n').repeat(100);
  assert.equal(estimateTokens(huge), 900000);
});

test('fmtTokens rounds to nearest 10k with k suffix', () => {
  assert.equal(fmtTokens(334500), '≈330k');
  assert.equal(fmtTokens(25000), '≈30k');
});

test('CJK chars weigh more than ascii', () => {
  const zh = estimateTokens('重构整个认证模块并补全测试'.repeat(50));
  const en = estimateTokens('refactor auth and add tests'.repeat(50));
  assert.ok(zh > en, `zh ${zh} should exceed en ${en}`);
});

test('bounds hold with heavy CJK', () => {
  assert.equal(estimateTokens('改'.repeat(200000)), 900000);
  assert.ok(estimateTokens('') >= 15000); // floor
});

test('estLines clamps to [40, 400] — a pasted log cannot mint a damage sponge', () => {
  const { estLines } = require('../core/estimate');
  assert.equal(estLines(1000), 40);          // floor
  assert.equal(estLines(900000), 400);       // ceiling (was 2600)
  assert.equal(estLines(null), Math.max(40, Math.round((25000 / 450) * 1.3))); // default untouched
});

test('repriceLines: damped growth, never shrinks, stays clamped', () => {
  const { repriceLines } = require('../core/estimate');
  assert.equal(repriceLines(100, 300), 200);     // 0.5·300 + 0.5·100
  assert.equal(repriceLines(100, 60), 100);      // smaller estimate → no shrink
  assert.equal(repriceLines(390, 400), 395);
  assert.equal(repriceLines(400, 400), 400);     // ceiling holds
  assert.equal(repriceLines(undefined, 80), 80); // no prior budget → take the new one
});
