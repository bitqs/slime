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

test('rewardLines matches emitRewards with a chest in play — no drift', () => {
  const r = {
    leveledUp: true, level: 3, titleKey: 'title.apprentice', newBadges: [], newQuests: [],
    chest: { tier: 'gold', rewardXp: 30, rewardNameKey: 'loot.xpMedium', eggPerk: 'crit' },
  };
  flow.emitRewards('s4b', r, 'en');
  const texts = state.readEvents('s4b')
    .filter((e) => ['chest_open', 'level_up', 'badge_unlocked'].includes(e.kind))
    .map((e) => e.text);
  assert.deepEqual(flow.rewardLines(r, 'en'), texts);
});

test('rewardLines: chest reveal leads, egg suffix included', () => {
  const r = {
    leveledUp: false, level: 3, titleKey: 'title.apprentice', newBadges: [], newQuests: [],
    chest: { tier: 'gold', rewardXp: 30, rewardNameKey: 'loot.xpMedium', eggPerk: 'crit' },
  };
  const lines = flow.rewardLines(r, 'en');
  assert.ok(lines[0].includes('Chest'), lines[0]);
  assert.ok(lines[0].includes('Gold'), lines[0]);
  assert.ok(lines[0].includes('+30 XP'), lines[0]);
  assert.ok(lines[0].includes('Slime Egg'), lines[0]);
  assert.ok(lines[0].includes('Crit'), lines[0]);
});

test('rewardLines: chest without egg has no egg suffix; missing chest is fine', () => {
  const r = {
    leveledUp: false, level: 1, titleKey: 'title.novice', newBadges: [], newQuests: [],
    chest: { tier: 'silver', rewardXp: 15, rewardNameKey: 'loot.xpSmall', eggPerk: null },
  };
  assert.ok(!flow.rewardLines(r, 'en')[0].includes('Egg'));
  // old callers without chest info must not crash
  assert.deepEqual(flow.rewardLines({ leveledUp: false, newBadges: [], newQuests: [] }, 'en'), []);
});
