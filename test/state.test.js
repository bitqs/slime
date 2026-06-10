const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// point state at a temp root BEFORE requiring the module
process.env.SLIME_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'slime-'));
const state = require('../core/state');

after(() => fs.rmSync(process.env.SLIME_ROOT, { recursive: true, force: true }));

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

test('listSessions lists snapshots newest-first with labels', () => {
  state.writeSnapshot('old1', { sessionId: 'old1', turn: 3, cwd: '/p/alpha', boss: { name: 'The Grim Alpha Trial Slime', hp: 40 } });
  state.writeSnapshot('new1', { sessionId: 'new1', turn: 1, cwd: '/p/beta' });
  // force distinct mtimes (fs mtime resolution can swallow same-ms writes)
  const old = path.join(process.env.SLIME_ROOT, 'sessions', 'old1.json');
  fs.utimesSync(old, new Date(Date.now() - 60000), new Date(Date.now() - 60000));
  const ls = state.listSessions();
  const a = ls.find((s) => s.id === 'old1');
  const b = ls.find((s) => s.id === 'new1');
  assert.ok(ls.indexOf(b) < ls.indexOf(a), 'newest first');
  assert.equal(b.project, 'beta');
  assert.equal(b.boss, null);
  assert.equal(a.boss, 'The Grim Alpha Trial Slime');
  assert.equal(a.turn, 3);
  assert.equal(typeof b.updated, 'number');
  assert.equal(b.active, true);
});

test('newestSessionId returns the most recently touched session', () => {
  state.ensureDirs();
  const dir = path.join(process.env.SLIME_ROOT, 'sessions');
  fs.writeFileSync(path.join(dir, 'old.json'), '{}');
  fs.utimesSync(path.join(dir, 'old.json'), new Date(Date.now() - 60000), new Date(Date.now() - 60000));
  fs.writeFileSync(path.join(dir, 'new.json'), '{}');
  assert.equal(state.newestSessionId(), 'new');
});
