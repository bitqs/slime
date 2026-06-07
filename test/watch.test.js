const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.CCQ_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'ccq-'));
after(() => fs.rmSync(process.env.CCQ_ROOT, { recursive: true, force: true }));
const { renderFrame } = require('../scripts/watch');

test('renders waiting banner with no session', () => {
  assert.match(renderFrame(null, null, [], 'en', 60), /waiting for a session/i);
});

test('renders battle frame with boss, stats and recent events', () => {
  const frame = renderFrame(
    { boss: { name: 'The Auth Bugbear', hp: 38 }, combo: 7, summons: 2, kills: 3, dmg: 842, turn: 14 },
    { fiveHour: { used: 32 } },
    [{ text: '⚔️ hit! 4 dmg' }, { text: '🏆 Turn 1 complete' }],
    'en', 80
  );
  assert.match(frame, /The Auth Bugbear/);
  assert.match(frame, /combo×7/);
  assert.match(frame, /⚡Token 68%/);
  assert.match(frame, /hit! 4 dmg/);
});

test('zero HP shows rest banner', () => {
  const frame = renderFrame(
    { boss: { name: 'X', hp: 50 }, turn: 1 },
    { fiveHour: { used: 100, resetsAt: 1780820000 } },
    [], 'en', 60
  );
  assert.match(frame, /Rest, commander|HP restored/);
});
