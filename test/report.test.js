const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.SLIME_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'slime-'));
const report = require('../core/report');

test('rank: S no hits + kills, A few hits, C many hits', () => {
  assert.equal(report.rank({ hits: 0, kills: 2 }), 'S');
  assert.equal(report.rank({ hits: 1, kills: 0 }), 'A');
  assert.equal(report.rank({ hits: 3, kills: 0 }), 'B');
  assert.equal(report.rank({ hits: 5, kills: 0 }), 'C');
  assert.equal(report.rank({ hits: 0, kills: 0, dmg: 50 }), 'A');
  assert.equal(report.rank({ hits: 0, kills: 0, dmg: 0 }), 'B');
});

test('aggregate sums turn events since last turn_end', () => {
  const evs = [
    { kind: 'turn_end' },
    { kind: 'resolve', dmg: 10 },
    { kind: 'resolve', kill: true },
    { kind: 'resolve', hit: true },
    { kind: 'cast', tool: 'Skill', text: '✨ [superpowers:brainstorming]' },
  ];
  const a = report.aggregate(evs);
  assert.equal(a.dmg, 10);
  assert.equal(a.kills, 1);
  assert.equal(a.hits, 1);
});

test('render contains boss bar, rank and kill prompt at low HP', () => {
  const txt = report.render(
    { dmg: 100, kills: 2, hits: 0, maxCombo: 5 },
    { name: 'The Web Hydra', hp: 15 },
    { turn: 3 }
  );
  assert.match(txt, /TURN #3/);
  assert.match(txt, /Rank: S/);
  assert.match(txt, /The Web Hydra/);
  assert.match(txt, /staggers/); // auto-kill stagger line shown at low HP
});

test('render omits kill prompt at high HP', () => {
  const txt = report.render(
    { dmg: 10, kills: 0, hits: 0, maxCombo: 1 },
    { name: 'The Web Hydra', hp: 80 },
    { turn: 1 }
  );
  assert.doesNotMatch(txt, /staggers/);
});

test('render shows stamina line and sage line via extras', () => {
  const txt = report.render(
    { dmg: 1, kills: 0, hits: 0, maxCombo: 1 },
    { name: 'The Web Hydra', hp: 90 },
    { turn: 2 },
    { usage: { fiveHour: { used: 30 }, sevenDay: { used: 20 } }, sageLine: '💡 Sage: test line' }
  );
  assert.match(txt, /⚡ Token/);
  assert.match(txt, /70%/);
  assert.match(txt, /Weekly/);
  assert.match(txt, /💡 Sage: test line/);
});
