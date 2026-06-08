const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
process.env.SLIME_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'slime-df-'));
const state = require('../core/state');
const flow = require('../core/defeat-flow');

test('emitRewards: emits level_up when leveledUp and one badge_unlocked per new badge', () => {
  flow.emitRewards('s1', { leveledUp: true, level: 3, titleKey: 'title.apprentice', newBadges: ['first-blood', 'combo-king'] }, 'en');
  const evs = state.readEvents('s1');
  assert.equal(evs.filter((e) => e.kind === 'level_up').length, 1);
  assert.equal(evs.filter((e) => e.kind === 'badge_unlocked').length, 2);
});

test('emitRewards: no level_up when not leveled, no badges when none', () => {
  flow.emitRewards('s2', { leveledUp: false, level: 1, titleKey: 'title.novice', newBadges: [] }, 'en');
  const evs = state.readEvents('s2');
  assert.equal(evs.filter((e) => e.kind === 'level_up').length, 0);
  assert.equal(evs.filter((e) => e.kind === 'badge_unlocked').length, 0);
});

test('emitRewards: tolerates missing sid / result', () => {
  assert.doesNotThrow(() => flow.emitRewards(null, { newBadges: [] }, 'en'));
  assert.doesNotThrow(() => flow.emitRewards('s3', null, 'en'));
});

test('rewardLines (console) matches the emitRewards event text — no drift', () => {
  const r = { leveledUp: true, level: 3, titleKey: 'title.apprentice', newBadges: ['first-blood', 'combo-king'] };
  flow.emitRewards('s4', r, 'en');
  const texts = state.readEvents('s4')
    .filter((e) => e.kind === 'level_up' || e.kind === 'badge_unlocked')
    .map((e) => e.text);
  assert.deepEqual(flow.rewardLines(r, 'en'), texts);
});
