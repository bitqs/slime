'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const chest = require('../core/chest');

const REWARDS = [
  { id: 'xp_small',  weight: 6, xp: 15, nameKey: 'loot.xpSmall',  fx: 'spark' },
  { id: 'xp_medium', weight: 3, xp: 30, nameKey: 'loot.xpMedium', fx: 'spark' },
  { id: 'xp_big',    weight: 1, xp: 60, nameKey: 'loot.xpBig',    fx: 'burst' },
];

test('rollTier: newbie sequence scripted for the first 6 chests (ATOM-L01)', () => {
  const expect = ['silver', 'silver', 'gold', 'silver', 'silver', 'jackpot'];
  for (let i = 0; i < 6; i++) {
    // any seed: the sequence must win regardless
    assert.equal(chest.rollTier('seed' + i, i), expect[i]);
  }
});

test('rollTier: honest odds from chest #7 — ≈5% jackpot / ≈19% gold / rest silver', () => {
  const n = { silver: 0, gold: 0, jackpot: 0 };
  for (let i = 0; i < 10000; i++) n[chest.rollTier('s' + i, 6)]++;
  assert.ok(n.jackpot > 300 && n.jackpot < 700, `jackpot ${n.jackpot}`);
  assert.ok(n.gold > 1400 && n.gold < 2400, `gold ${n.gold}`);
  assert.ok(n.silver > 7000, `silver ${n.silver}`);
});

test('rollTier: luck bonus shifts tiers upward', () => {
  let j0 = 0, j1 = 0;
  for (let i = 0; i < 5000; i++) {
    if (chest.rollTier('s' + i, 6) === 'jackpot') j0++;
    if (chest.rollTier('s' + i, 6, 0.10) === 'jackpot') j1++;
  }
  assert.ok(j1 > j0, `boosted ${j1} ≤ base ${j0}`);
});

test('rollTier: deterministic', () => {
  assert.equal(chest.rollTier('same', 10), chest.rollTier('same', 10));
});

test('ensureTier: stamps once, never re-rolls', () => {
  const b = { name: 'Boss', created: 123 };
  const t1 = chest.ensureTier(b, 7);
  assert.ok(['silver', 'gold', 'jackpot'].includes(t1));
  assert.equal(chest.ensureTier(b, 999), t1); // different count → still sealed
});

test('open: jackpot always carries an egg; weights shift toward big', () => {
  let bigs = 0;
  for (let i = 0; i < 1000; i++) {
    const r = chest.open('j' + i, 'jackpot', REWARDS);
    assert.equal(r.egg, true);
    assert.notEqual(r.reward.id, 'xp_small'); // weight 0 in jackpot
    if (r.reward.id === 'xp_big') bigs++;
  }
  assert.ok(bigs > 550, `expected xp_big majority, got ${bigs}`);
});

test('open: silver eggs are rare (~10%)', () => {
  let eggs = 0;
  for (let i = 0; i < 5000; i++) if (chest.open('s' + i, 'silver', REWARDS).egg) eggs++;
  assert.ok(eggs > 300 && eggs < 700, `eggs ${eggs}`);
});

test('open: malformed rewards → null reward, never throws', () => {
  const r = chest.open('x', 'gold', []);
  assert.equal(r.reward, null);
});

test('ensureTier: re-seals an unknown stored tier', () => {
  const b = { name: 'Boss', created: 5, chestTier: 'legendary' };
  const t = chest.ensureTier(b, 7);
  assert.ok(['silver', 'gold', 'jackpot'].includes(t));
  assert.equal(b.chestTier, t);
});

test('open: bonus > 1 clamps, jackpot egg still guaranteed', () => {
  const r = chest.open('clamp', 'jackpot', [{ id: 'xp_big', weight: 1, xp: 60, nameKey: 'loot.xpBig', fx: 'burst' }], 5);
  assert.equal(r.egg, true);
  assert.equal(r.reward.id, 'xp_big');
});
