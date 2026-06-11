const { test } = require('node:test');
const assert = require('node:assert');

const Moves = require('../public/moves.js');

/** Deterministic rng from a fixed sequence (loops). */
function seqRng(vals) {
  let i = 0;
  return () => vals[i++ % vals.length];
}

test('element mapping per tool', () => {
  const p = Moves.createPicker(seqRng([0.99])); // 0.99 → never crits
  assert.equal(p.pick('Edit', 1).element, 'blade');
  assert.equal(p.pick('Write', 1).element, 'blade');
  assert.equal(p.pick('Bash', 1).element, 'fire');
  assert.equal(p.pick('Grep', 1).element, 'lightning');
  assert.equal(p.pick('Glob', 1).element, 'lightning');
  assert.equal(p.pick('Read', 1).element, 'holy');
  assert.equal(p.pick('WebFetch', 1).element, 'ice');
  assert.equal(p.pick('WebSearch', 1).element, 'ice');
  assert.equal(p.pick('SomethingElse', 1).element, 'arcane');
});

test('shuffle bag exhausts all moves before any repeat', () => {
  const p = Moves.createPicker(seqRng([0.99, 0.4, 0.7, 0.1]));
  const seen = [];
  for (let i = 0; i < 4; i++) seen.push(p.pick('Edit', 1).move);
  assert.equal(new Set(seen).size, 4, `first bag must be 4 distinct moves, got ${seen}`);
});

test('no immediate repeat across bag refill', () => {
  const p = Moves.createPicker(seqRng([0.99, 0.3, 0.6, 0.2, 0.8]));
  const seq = [];
  for (let i = 0; i < 40; i++) seq.push(p.pick('Bash', 1).move);
  for (let i = 1; i < seq.length; i++) {
    assert.notEqual(seq[i], seq[i - 1], `repeat at ${i}: ${seq[i]}`);
  }
});

test('finisher tier on every 3rd consecutive strike', () => {
  const p = Moves.createPicker(seqRng([0.99]));
  assert.equal(p.pick('Edit', 1).tier, 'normal');
  assert.equal(p.pick('Edit', 2).tier, 'normal');
  assert.equal(p.pick('Edit', 3).tier, 'finisher');
  assert.equal(p.pick('Edit', 4).tier, 'normal');
  assert.equal(p.pick('Edit', 6).tier, 'finisher');
  assert.equal(p.pick('Edit', 0).tier, 'normal'); // combo 0 never finishes
});

test('PRD crit: rate in [3%,8%] over 10k, never twice in a row', () => {
  // LCG: deterministic, full [0,1) coverage
  let s = 42;
  const rng = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const p = Moves.createPicker(rng);
  let crits = 0;
  let prev = false;
  for (let i = 0; i < 10000; i++) {
    const isCrit = p.pick('Edit', 1).tier === 'crit';
    if (isCrit) {
      crits++;
      assert.equal(prev, false, `back-to-back crit at ${i}`);
    }
    prev = isCrit;
  }
  const rate = crits / 10000;
  assert.ok(rate > 0.03 && rate < 0.08, `crit rate ${rate}`);
});

test('crit outranks finisher', () => {
  const p = Moves.createPicker(seqRng([0])); // rng 0 → always crit
  assert.equal(p.pick('Edit', 3).tier, 'crit');
});

test('jitter stays in ±20% band; names are bilingual', () => {
  let s = 7;
  const rng = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const p = Moves.createPicker(rng);
  for (let i = 0; i < 200; i++) {
    const m = p.pick('Read', 1);
    assert.ok(m.jitter >= 0.8 && m.jitter <= 1.2, `jitter ${m.jitter}`);
    assert.ok(m.name && typeof m.name.en === 'string' && typeof m.name.zh === 'string');
  }
});

test('setCritBase: raises the floor, clamps to [base, 0.05]', () => {
  const p = Moves.createPicker(() => 0.0049); // rng under a 0.005 base → crit
  p.setCritBase(0.005);
  assert.equal(p.pick('Edit', 1).tier, 'crit');
  const q = Moves.createPicker(() => 0.0049);
  // without the boost the same rng must NOT crit on the first pick (base 0.002)
  assert.notEqual(q.pick('Edit', 1).tier, 'crit');
  // rng 0.06 sits just above the 0.05 ceiling: if the clamp held, no crit;
  // if 99 leaked through as the base, this would crit — a tight proof
  const r = Moves.createPicker(() => 0.06);
  r.setCritBase(99); // clamps to 0.05, never 99
  assert.notEqual(r.pick('Edit', 1).tier, 'crit');
});
