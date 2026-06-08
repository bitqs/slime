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
