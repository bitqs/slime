const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.SLIME_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'slime-'));
after(() => fs.rmSync(process.env.SLIME_ROOT, { recursive: true, force: true }));
const hud = require('../core/hud');

const TIPS = ['💡 tip one', '💡 tip two'];

test('no snapshot renders idle banner', () => {
  assert.match(hud.render(null, {}, TIPS, 0), /Slime|史莱姆/);
});

test('fresh battle event renders battle frame with boss and combo', () => {
  const now = Date.now();
  const line = hud.render(
    { inTurn: true, combo: 7, kills: 3, dmg: 842, summons: 2,
      boss: { name: 'The Web Hydra', hp: 38 }, lastText: '⚔️ Carves with [Edit] → auth.ts…', updated: now },
    { cost: { total_cost_usd: 1.23 } }, TIPS, now
  );
  assert.match(line, /👾/); // boss is an icon now — names stay off the statusline
  assert.match(line, /🔥×7/);
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
  assert.match(line, /⚡68%/);
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

test('broken boss renders the finish hint instead of the hp bar', () => {
  const line = hud.render({ sessionId: 'x', turn: 1, combo: 0, kills: 0, dmg: 0, summons: 0,
    inTurn: true, updated: Date.now(), boss: { name: 'The Rabid Web Bugbear', hp: 0, broken: true } },
    null, [], Date.now(), null, 'en');
  assert.match(line, /☠/);
  assert.match(line, /\/defeat/);
});

test('todo counter and next-step hint render from snap.todos', () => {
  const line = hud.render({ sessionId: 'x', turn: 1, combo: 0, kills: 0, dmg: 0, summons: 0,
    inTurn: true, updated: Date.now(), boss: { name: 'B', hp: 50 },
    todos: [
      { content: 'a', status: 'completed', label: 'W mob 1', form: 0 },
      { content: 'b', status: 'in_progress', label: 'W mob 2', activeForm: 'fixing b', form: 1 },
    ] },
    null, [], Date.now(), null, 'en');
  assert.match(line, /⚔1\/2/);
  assert.match(line, /fixing b/);
});

test('live arena renders a clickable 【UI】 link carrying the live port', () => {
  const now = Date.now();
  const snap = { inTurn: true, combo: 0, kills: 0, dmg: 0, summons: 0, updated: now };
  const line = hud.render(snap, {}, TIPS, now, null, 'en', { port: 4118 });
  assert.match(line, /【UI】/);
  assert.match(line, /127\.0\.0\.1:4118/); // URL tracks the live port, not a hardcoded one
});

test('no live arena → no 【UI】 link (never a dead link)', () => {
  const now = Date.now();
  const snap = { inTurn: true, combo: 0, kills: 0, dmg: 0, summons: 0, updated: now };
  const line = hud.render(snap, {}, TIPS, now, null, 'en', null);
  assert.doesNotMatch(line, /【UI】/);
});

test('between turns also leads with 🟢 + live 【UI】 link', () => {
  const now = Date.now();
  const snap = { inTurn: false, updated: now - 60000, lastText: '🏆 Turn 3 complete — Rank S' };
  const line = hud.render(snap, {}, TIPS, now, null, 'en', { port: 4117 });
  assert.match(line, /🟢/);
  assert.match(line, /【UI】/);
  assert.match(line, /Rank S/); // result still shown after the badge
});
