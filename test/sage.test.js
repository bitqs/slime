const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.SLIME_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'slime-'));
after(() => fs.rmSync(process.env.SLIME_ROOT, { recursive: true, force: true }));
const sage = require('../scripts/lib/sage');

test('advises rest when HP critically low', () => {
  const a = sage.advise({ usage: { fiveHour: { used: 96 } } });
  assert.match(a, /🛌|rest|token/i);
});

test('advises potion when context heavy', () => {
  const a = sage.advise({ usage: { fiveHour: { used: 10 }, contextPct: 85 } });
  assert.match(a, /\/compact/);
});

test('advises pacing when HP burns fast but boss barely moved', () => {
  const a = sage.advise({ usage: { fiveHour: { used: 60 } }, bossHp: 90 });
  assert.match(a, /slow|pacing|pace/i);
});

test('silent when nothing to say', () => {
  assert.equal(sage.advise({ usage: { fiveHour: { used: 10 }, contextPct: 20 }, bossHp: 50 }), null);
});

test('priority: rest beats potion', () => {
  const a = sage.advise({ usage: { fiveHour: { used: 97 }, contextPct: 90 } });
  assert.match(a, /🛌|rest|token/i);
});
