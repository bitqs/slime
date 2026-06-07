const { test } = require('node:test');
const assert = require('node:assert');
const seq = require('../public/sequencer');

test('advance fires steps at their frame, in order', () => {
  const tl = seq.createTimeline([{ at: 2, do: 'b' }, { at: 0, do: 'a' }, { at: 2, do: 'c' }]);
  assert.deepEqual(seq.advance(tl).map(s => s.do), ['a']); // frame 0
  assert.deepEqual(seq.advance(tl), []);                    // frame 1
  assert.deepEqual(seq.advance(tl).map(s => s.do), ['b', 'c']); // frame 2
  assert.equal(tl.done, true);
});

test('empty timeline is done immediately', () => {
  const tl = seq.createTimeline([]);
  assert.equal(tl.done, true);
  assert.deepEqual(seq.advance(tl), []);
});

test('governor caps flashes per second', () => {
  const g = seq.createGovernor(3, 60); // min gap 20 frames
  assert.equal(g.allow(0), true);
  assert.equal(g.allow(10), false);
  assert.equal(g.allow(20), true);
  assert.equal(g.allow(39), false);
  assert.equal(g.allow(40), true);
});
