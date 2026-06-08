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
