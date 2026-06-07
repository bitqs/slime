const { test } = require('node:test');
const assert = require('node:assert');
const { estimateTokens, fmtTokens } = require('../scripts/lib/estimate');

test('base estimate for tiny text is the floor', () => {
  assert.equal(estimateTokens(''), 25000);
  assert.equal(estimateTokens('fix typo'), 25000 + 'fix typo'.length * 3);
});

test('each plan step adds 30k', () => {
  const plan = '1. slay dragon\n2. loot hoard\n- profit';
  const base = 25000 + plan.length * 3;
  assert.equal(estimateTokens(plan), base + 3 * 30000);
});

test('clamped to 900k', () => {
  const huge = ('- step\n').repeat(100);
  assert.equal(estimateTokens(huge), 900000);
});

test('fmtTokens rounds to nearest 10k with k suffix', () => {
  assert.equal(fmtTokens(334500), '≈330k');
  assert.equal(fmtTokens(25000), '≈30k');
});
