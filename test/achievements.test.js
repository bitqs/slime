const { test } = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

process.env.SLIME_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'slime-ach-'));
const ach = require('../scripts/achievements');

test('render: shows level line and owned vs locked badges', () => {
  const profile = {
    milestones: [],
    totals: { turns: 0, dmg: 0, kills: 0 },
    gear: {},
    xp: 150,                                   // L2
    badges: [{ id: 'first-blood', unlockedAt: 1 }],
  };
  const out = ach.render(profile, 'en');
  assert.match(out, /Lv2/);                     // level shown
  assert.match(out, /First Blood/);             // owned badge name
  assert.match(out, /✅/);                       // owned marker
  assert.match(out, /🔒/);                       // at least one locked badge
  assert.match(out, /Combo King/);              // a locked badge still listed
});

test('render: empty profile is safe (Lv1, all locked)', () => {
  const out = ach.render({ milestones: [], totals: { turns: 0, dmg: 0, kills: 0 }, gear: {} }, 'en');
  assert.match(out, /Lv1/);
  assert.doesNotMatch(out, /✅/);                // nothing owned
});

test('render: shows both quests with progress/target, defaulting to 0 when unseeded', () => {
  const ach = require('../scripts/achievements');
  const out = ach.render({ xp: 0, badges: [], milestones: [] }, 'en');
  assert.match(out, /Quests/);
  assert.match(out, /Weekly Hunter\s+0\/5/);
  assert.match(out, /Daily Grind\s+0\/7/);
});

test('render: reflects an active quest instance progress/target', () => {
  const ach = require('../scripts/achievements');
  const profile = {
    xp: 0, badges: [], milestones: [],
    quests: [{ id: 'weekly_kills', kind: 'weekly_kills', target: 5, progress: 3, startedAt: 1 }],
  };
  const out = ach.render(profile, 'en');
  assert.match(out, /Weekly Hunter\s+3\/5/);
});

test('render: egg section lists per-perk counts', () => {
  const out = ach.render({ milestones: [], totals: { turns: 0, dmg: 0, kills: 0 }, gear: {},
    eggs: { xp: 3, crit: 1 } }, 'en');
  assert.ok(out.includes('🥚'), out);
  assert.ok(out.includes('×3'), out);
});
