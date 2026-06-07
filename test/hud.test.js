const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.CCQ_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'ccq-'));
after(() => fs.rmSync(process.env.CCQ_ROOT, { recursive: true, force: true }));
const hud = require('../scripts/lib/hud');

const TIPS = ['💡 tip one', '💡 tip two'];

test('no snapshot renders idle banner', () => {
  assert.match(hud.render(null, {}, TIPS, 0), /Questline/);
});

test('fresh battle event renders battle frame with boss and combo', () => {
  const now = Date.now();
  const line = hud.render(
    { inTurn: true, combo: 7, kills: 3, dmg: 842, summons: 2,
      boss: { name: 'The Web Hydra', hp: 38 }, lastText: '⚔️ Carves with [Edit] → auth.ts…', updated: now },
    { cost: { total_cost_usd: 1.23 } }, TIPS, now
  );
  assert.match(line, /The Web Hydra/);
  assert.match(line, /combo×7/);
  assert.match(line, /🐺×2/);
  assert.match(line, /\[Edit\]/);
});

test('idle >20s during turn rotates loading tips', () => {
  const now = 10 * 60 * 1000;
  const snap = { inTurn: true, updated: now - 25000, lastText: 'x' };
  const line = hud.render(snap, {}, TIPS, now);
  assert.match(line, /💡 tip/);
});

test('out of turn shows last result, not tips', () => {
  const now = Date.now();
  const snap = { inTurn: false, updated: now - 60000, lastText: '🏆 Turn 3 complete — Rank S' };
  assert.match(hud.render(snap, {}, TIPS, now), /Rank S/);
});

test('battle frame shows player HP from usage cache', () => {
  const now = Date.now();
  const line = hud.render(
    { inTurn: true, combo: 0, kills: 0, dmg: 5, summons: 0, lastText: 'x', updated: now },
    {}, TIPS, now,
    { fiveHour: { used: 32, resetsAt: 0 } }
  );
  assert.match(line, /⚡Token 68%/);
});

test('zero HP renders rest banner with reset time', () => {
  const now = Date.now();
  const line = hud.render(
    { inTurn: false, lastText: 'x', updated: now },
    {}, TIPS, now,
    { fiveHour: { used: 100, resetsAt: 1780810000 } }
  );
  assert.match(line, /Token restores at/);
});
