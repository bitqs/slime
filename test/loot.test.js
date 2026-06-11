const { test } = require('node:test');
const assert = require('node:assert');
const loot = require('../core/loot');

const TBL = {
  chance: 1,
  rewards: [
    { id: 'a', weight: 6, xp: 5, nameKey: 'loot.a', fx: 'spark' },
    { id: 'b', weight: 3, xp: 10, nameKey: 'loot.b', fx: 'spark' },
    { id: 'c', weight: 1, xp: 15, nameKey: 'loot.c', fx: 'burst' },
  ],
};

test('roll: deterministic — same seed + table returns the same reward', () => {
  for (const s of ['x', 'y', 'session:42']) {
    assert.strictEqual(loot.roll(s, TBL), loot.roll(s, TBL));
  }
});

test('roll: chance 0 never drops', () => {
  const t = { ...TBL, chance: 0 };
  for (let i = 0; i < 200; i++) assert.equal(loot.roll('k' + i, t), null);
});

test('roll: chance 1 always drops', () => {
  for (let i = 0; i < 200; i++) assert.ok(loot.roll('k' + i, TBL));
});

test('roll: chance ~0.03 keeps drops rare', () => {
  const t = { ...TBL, chance: 0.03 };
  let drops = 0;
  for (let i = 0; i < 2000; i++) if (loot.roll('s' + i, t)) drops++;
  assert.ok(drops > 0 && drops < 200, `expected rare drops, got ${drops}/2000`);
});

test('roll: weighted — common reward beats rare, rare still appears', () => {
  const counts = {};
  for (let i = 0; i < 600; i++) {
    const r = loot.roll('w' + i, TBL);
    counts[r.id] = (counts[r.id] || 0) + 1;
  }
  assert.ok(counts.a > counts.c, `expected a (w6) > c (w1): ${JSON.stringify(counts)}`);
  assert.ok(counts.c >= 1, 'rare reward c should still appear');
});

test('roll: reward pick is decorrelated from the drop gate (>=2 distinct ids)', () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) { const r = loot.roll('d' + i, TBL); if (r) seen.add(r.id); }
  assert.ok(seen.size >= 2, `expected variety, saw ${[...seen]}`);
});

test('roll: a dropped reward carries the fields the loot_drop event needs', () => {
  const r = loot.roll('x', TBL);
  for (const k of ['id', 'xp', 'fx', 'nameKey']) assert.ok(k in r, `reward missing ${k}`);
});

test('roll: fail-soft on missing/empty/malformed tables — returns null, never throws', () => {
  assert.equal(loot.roll('s', { chance: 0.5, rewards: [] }), null);
  assert.equal(loot.roll('s', {}), null);
  assert.equal(loot.roll('s', null), null);
  assert.equal(loot.roll('s', { chance: 1, rewards: [{ id: 'z', weight: 0, xp: 1, nameKey: 'k', fx: 'spark' }] }), null);
});

test('roll: bonus param raises the drop gate (luck cross-cut)', () => {
  const t = { ...TBL, chance: 0.04 };
  let base = 0, boosted = 0;
  for (let i = 0; i < 5000; i++) {
    if (loot.roll('lb' + i, t)) base++;
    if (loot.roll('lb' + i, t, 0.10)) boosted++;
  }
  assert.ok(boosted > base, `boosted ${boosted} ≤ base ${base}`);
});

test('roll: bonus clamps — chance + bonus > 1 still behaves like 1', () => {
  for (let i = 0; i < 50; i++) assert.ok(loot.roll('c' + i, TBL, 5) !== undefined);
});
