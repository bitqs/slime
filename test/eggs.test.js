const { test } = require('node:test');
const assert = require('node:assert');
const eggs = require('../core/eggs');

test('roll: deterministic — same seed same outcome', () => {
  for (const s of ['a', 'b', 'sess:42']) assert.deepEqual(eggs.roll(s), eggs.roll(s));
});

test('roll: ~3% drop rate over many seeds', () => {
  let drops = 0;
  for (let i = 0; i < 10000; i++) if (eggs.roll('seed' + i)) drops++;
  assert.ok(drops > 150 && drops < 450, `expected ~300 drops, got ${drops}`);
});

test('roll: bonus raises the rate (luck cross-cuts, ATOM-L04)', () => {
  let base = 0, boosted = 0;
  for (let i = 0; i < 5000; i++) {
    if (eggs.roll('s' + i)) base++;
    if (eggs.roll('s' + i, 0.05)) boosted++;
  }
  assert.ok(boosted > base, `boosted ${boosted} ≤ base ${base}`);
});

test('pickPerk: weighted ≈ 40/30/25/5 over many seeds', () => {
  const n = { xp: 0, loot: 0, crit: 0, combo: 0 };
  for (let i = 0; i < 10000; i++) n[eggs.pickPerk('p' + i).id]++;
  assert.ok(n.xp > 3500 && n.xp < 4500, `xp ${n.xp}`);
  assert.ok(n.loot > 2500 && n.loot < 3500, `loot ${n.loot}`);
  assert.ok(n.crit > 2000 && n.crit < 3000, `crit ${n.crit}`);
  assert.ok(n.combo > 250 && n.combo < 750, `combo ${n.combo}`);
});

test('multipliers: zero eggs = identity; counts scale linearly', () => {
  assert.equal(eggs.xpMult({}), 1);
  assert.equal(eggs.lootBonus({}), 0);
  assert.equal(eggs.critBonus({}), 0);
  assert.equal(eggs.comboCap({}), 2);
  const p = { eggs: { xp: 10, loot: 5, crit: 4, combo: 3 } };
  assert.ok(Math.abs(eggs.xpMult(p) - 1.10) < 1e-9);
  assert.ok(Math.abs(eggs.lootBonus(p) - 0.01) < 1e-9);
  assert.ok(Math.abs(eggs.critBonus(p) - 0.02) < 1e-9);
  assert.ok(Math.abs(eggs.comboCap(p) - 2.12) < 1e-9);
});

test('comboCap: hard ceiling ×3 (ATOM-P08)', () => {
  assert.equal(eggs.comboCap({ eggs: { combo: 999 } }), 3);
});

test('grant: increments and tolerates missing eggs object', () => {
  const p = {};
  assert.equal(eggs.grant(p, 'xp'), 1);
  assert.equal(eggs.grant(p, 'xp'), 2);
  assert.equal(eggs.total(p), 2);
});

test('grant: unknown perk id is rejected, profile untouched', () => {
  const p = {};
  assert.equal(eggs.grant(p, 'bogus'), 0);
  assert.equal(eggs.total(p), 0);
  assert.ok(!p.eggs || !('bogus' in p.eggs));
});
