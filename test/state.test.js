const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// point state at a temp root BEFORE requiring the module
process.env.CCQ_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'ccq-'));
const state = require('../scripts/lib/state');

after(() => fs.rmSync(process.env.CCQ_ROOT, { recursive: true, force: true }));

test('appendEvent then readEvents round-trips', () => {
  state.appendEvent('s1', { t: 1, kind: 'cast', text: 'hi' });
  state.appendEvent('s1', { t: 2, kind: 'resolve', dmg: 5 });
  const evs = state.readEvents('s1');
  assert.equal(evs.length, 2);
  assert.equal(evs[1].dmg, 5);
});

test('readEvents on missing session returns []', () => {
  assert.deepEqual(state.readEvents('nope'), []);
});

test('snapshot write/read round-trips, missing returns null', () => {
  assert.equal(state.readSnapshot('s2'), null);
  state.writeSnapshot('s2', { turn: 3 });
  assert.equal(state.readSnapshot('s2').turn, 3);
});

test('profile defaults then persists', () => {
  const p = state.readProfile();
  assert.deepEqual(p.milestones, []);
  p.milestones.push({ boss: 'The Test Golem' });
  state.writeProfile(p);
  assert.equal(state.readProfile().milestones.length, 1);
});
