const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.SLIME_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'slime-'));
after(() => fs.rmSync(process.env.SLIME_ROOT, { recursive: true, force: true }));
const state = require('../core/state');
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

test('card box stays square even with a long gear line', () => {
  const card = wrapped.card({ dmg: 1, kills: 1, turns: 1, hits: 0, activeDays: 1, milestones: [],
    topGear: [['superpowers', 14], ['code-review', 3], ['frontend-design', 1]] }, 'en');
  const lines = card.split('\n');
  const maxw = [...lines[0]].length; // the ╔══╗ border defines the box width
  for (const l of lines) assert.ok([...l].length <= maxw, `row overflows past the border: "${l}"`);
  assert.ok(lines.every((l) => l.endsWith('╗') || l.endsWith('╣') || l.endsWith('╝') || l.endsWith('║')), 'every row closes the box');
});

test('shareText: stats + repo link, both locales', () => {
  const data = { dmg: 2341, kills: 12, turns: 9, hits: 0, activeDays: 5, maxCombo: 11,
    milestones: new Array(3), topGear: [], streak: { days: 5 } };
  for (const lang of ['en', 'zh']) {
    const s = wrapped.shareText(data, lang);
    for (const n of ['2341', '12', '3', '×11']) assert.ok(s.includes(n), `${lang} missing ${n}`);
    assert.match(s, /github\.com\/bitqs\/slime/);
  }
});

test('svg card embeds the stats and is well-formed', () => {
  const wc = require('../core/wrapped-card');
  const svg = wc.svg(
    { dmg: 8690, kills: 306, turns: 84, activeDays: 2, maxCombo: 17, milestones: new Array(44), topGear: [['superpowers', 14]] },
    (k) => k, { lang: 'en', now: Date.parse('2026-06-09T12:00:00Z') });
  assert.match(svg, /^<svg[\s\S]*<\/svg>\s*$/);
  for (const n of ['8690', '306', '84', '44', '×17']) assert.ok(svg.includes(n), `missing ${n}`);
  assert.match(svg, /github\.com\/bitqs\/slime/);
});
