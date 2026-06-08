const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.SLIME_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'slime-'));
after(() => fs.rmSync(process.env.SLIME_ROOT, { recursive: true, force: true }));
const state = require('../scripts/lib/state');
const wrapped = require('../scripts/wrapped');

test('weekly aggregates last 7 days only', () => {
  const now = Date.now();
  const day = 24 * 3600 * 1000;
  state.appendEvent('w1', { t: now - day, kind: 'resolve', dmg: 10 });
  state.appendEvent('w1', { t: now - day, kind: 'resolve', kill: true });
  state.appendEvent('w1', { t: now - day, kind: 'turn_end' });
  state.appendEvent('w1', { t: now - 10 * day, kind: 'resolve', dmg: 999 }); // too old
  state.appendEvent('w2', { t: now - 2 * day, kind: 'resolve', dmg: 5 });
  state.appendEvent('w2', { t: now - 2 * day, kind: 'turn_end' });
  const w = wrapped.weekly(now);
  assert.equal(w.dmg, 15);
  assert.equal(w.kills, 1);
  assert.equal(w.turns, 2);
  assert.equal(w.activeDays, 2);
});

test('card renders box with numbers', () => {
  const card = wrapped.card({ dmg: 15, kills: 1, turns: 2, hits: 0, activeDays: 2, milestones: [], topGear: [['superpowers', 9]] }, 'en');
  assert.match(card, /╔═+╗/);
  assert.match(card, /15/);
  assert.match(card, /superpowers/);
});
