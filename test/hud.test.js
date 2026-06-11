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

test('daily streak shows a 🔥 badge once it is ≥2 days', () => {
  const now = Date.now();
  const snap = { inTurn: true, combo: 0, kills: 0, dmg: 1, summons: 0, lastText: 'x', updated: now };
  assert.match(hud.render(snap, {}, TIPS, now, null, 'en', null, 5, undefined, 7), /🔥7d/);
  assert.doesNotMatch(hud.render(snap, {}, TIPS, now, null, 'en', null, 5, undefined, 1), /🔥\dd/);
});

test("prestige shows a ⟳ badge", () => {
  const now = Date.now();
  const snap = { inTurn: true, combo: 0, kills: 0, dmg: 1, summons: 0, lastText: "x", updated: now };
  assert.match(hud.render(snap, {}, TIPS, now, null, "en", null, 5, undefined, 0, 2), /⟳2/);
});

test('in-turn frame wraps elapsed + context tokens from the usage cache', () => {
  const now = Date.now();
  const snap = { inTurn: true, combo: 0, kills: 0, dmg: 1, summons: 0, lastText: 'x', updated: now };
  const cache = { fiveHour: { used: 2, resetsAt: 0 }, sevenDay: null, contextPct: 10, source: 'official', durationMs: 401000, ctxTokens: 24500, outTokens: 3100, t: now };
  const line = hud.render(snap, {}, TIPS, now, cache);
  assert.match(line, /⏱6m41s/);
  assert.match(line, /↑24\.5k/);
  assert.match(line, /↓3\.1k/);
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
  assert.match(line, /⚡ DTK68%/);
});

test('statusline shows both DTK (5h) and WTK (7-day) labelled token meters', () => {
  const now = Date.now();
  const line = hud.render(
    { inTurn: true, combo: 0, kills: 0, dmg: 5, summons: 0, lastText: 'x', updated: now },
    {}, TIPS, now,
    { fiveHour: { used: 32, resetsAt: 0 }, sevenDay: { used: 20, resetsAt: 0 } }
  );
  assert.match(line, /⚡ DTK68%/);  // DTK — daily 5h window
  assert.match(line, /🏕 WTK80%/);  // WTK — weekly 7-day window
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
  assert.match(line, /falls when you stop/);
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

test('live arena renders a clickable [HUD] link carrying the live port', () => {
  const now = Date.now();
  const snap = { inTurn: true, combo: 0, kills: 0, dmg: 0, summons: 0, updated: now };
  const line = hud.render(snap, {}, TIPS, now, null, 'en', { port: 4118 });
  assert.match(line, /\[HUD\]/);
  assert.match(line, /127\.0\.0\.1:4118/);
  // OSC 8 needs a real ESC byte + BEL terminator or terminals render it as junk
  assert.ok(line.includes('\x1b]8;;http://127.0.0.1:4118\x07[HUD]\x1b]8;;\x07'),
    'OSC 8 hyperlink is malformed');
});

test('non-numeric cost from stdin is ignored, not crashed on', () => {
  const now = Date.now();
  const snap = { inTurn: true, combo: 0, kills: 0, dmg: 0, summons: 0, updated: now };
  const line = hud.render(snap, { cost: { total_cost_usd: '1.50' } }, TIPS, now, null, 'en');
  assert.ok(!line.includes('💰'), 'string cost must not render');
  const line2 = hud.render(snap, { cost: { total_cost_usd: 1.5 } }, TIPS, now, null, 'en');
  assert.match(line2, /💰\$1\.50/);
});

test('between turns leads with 🟢 + the [HUD] link and shows the result', () => {
  const now = Date.now();
  const snap = { inTurn: false, updated: now - 60000, lastText: '🏆 Turn 3 complete — Rank S' };
  const line = hud.render(snap, {}, TIPS, now, null, 'en', { port: 4117 });
  assert.match(line, /🟢/);
  assert.match(line, /\[HUD\]/);
  assert.match(line, /Rank S/);
});

test('quest badge renders after the Lv badge in-turn', () => {
  const now = Date.now();
  const line = hud.render(
    { inTurn: true, combo: 2, kills: 1, dmg: 10, summons: 0,
      boss: { name: 'B', hp: 50 }, lastText: 'x', updated: now },
    {}, TIPS, now, null, 'en', null, 4, '3/5'
  );
  assert.match(line, /✦Lv4 🎯3\/5/);
});

test('quest badge renders between turns', () => {
  const now = Date.now();
  const snap = { inTurn: false, updated: now - 60000, lastText: '🏆 done' };
  const line = hud.render(snap, {}, TIPS, now, null, 'en', null, 4, '3/5');
  assert.match(line, /✦Lv4 🎯3\/5/);
});

test('no quest badge when the quest arg is omitted', () => {
  const now = Date.now();
  const snap = { inTurn: false, updated: now - 60000, lastText: '🏆 done' };
  const line = hud.render(snap, {}, TIPS, now, null, 'en', null, 4);
  assert.doesNotMatch(line, /🎯/);
});

test('render: egg badge shows after streak when eggs > 0', () => {
  const snap = { sessionId: 's', turn: 1, combo: 0, kills: 0, dmg: 0, summons: 0, inTurn: false, lastText: 'hi', updated: Date.now() };
  const line = hud.render(snap, null, [], Date.now(), null, 'en', null, 5, undefined, 0, 0, 47);
  assert.ok(line.includes('🥚47'), line);
  const none = hud.render(snap, null, [], Date.now(), null, 'en', null, 5, undefined, 0, 0, 0);
  assert.ok(!none.includes('🥚'), none);
});
