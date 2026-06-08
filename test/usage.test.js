const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.SLIME_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'slime-'));
after(() => fs.rmSync(process.env.SLIME_ROOT, { recursive: true, force: true }));
const usage = require('../core/usage');

test('cacheFromStatusline stores official rate limits', () => {
  usage.cacheFromStatusline({
    rate_limits: {
      five_hour: { used_percentage: 32, resets_at: 1780810000 },
      seven_day: { used_percentage: 81, resets_at: 1781000000 },
    },
    context_window: { used_percentage: 44 },
  });
  const u = usage.readCache();
  assert.equal(u.fiveHour.used, 32);
  assert.equal(u.sevenDay.used, 81);
  assert.equal(u.contextPct, 44);
  assert.equal(u.source, 'official');
});

test('cacheFromStatusline tolerates absent rate_limits (non-Pro)', () => {
  usage.cacheFromStatusline({ context_window: { used_percentage: 10 } });
  const u = usage.readCache();
  assert.equal(u.contextPct, 10);
  // previous official five_hour data must be preserved, not wiped
  assert.equal(u.fiveHour.used, 32);
});

test('hp converts used% to remaining HP', () => {
  assert.equal(usage.hp({ fiveHour: { used: 32 } }), 68);
  assert.equal(usage.hp({}), null);
});

test('readCache on empty root returns nulls', () => {
  const root2 = fs.mkdtempSync(path.join(os.tmpdir(), 'slime2-'));
  const u = usage.readCache(root2);
  assert.equal(u.fiveHour, null);
  fs.rmSync(root2, { recursive: true, force: true });
});

test('identical data skips rewrite (dirty check)', () => {
  const payload = { rate_limits: { five_hour: { used_percentage: 50, resets_at: 99 } } };
  usage.cacheFromStatusline(payload);
  const t1 = usage.readCache().t;
  usage.cacheFromStatusline(payload);   // same data again
  assert.equal(usage.readCache().t, t1); // not rewritten
  usage.cacheFromStatusline({ rate_limits: { five_hour: { used_percentage: 51, resets_at: 99 } } });
  assert.equal(usage.readCache().fiveHour.used, 51); // changed data rewrites
});

test('cacheFromStatusline persists cost, model, lines, duration', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'slime-usage-'));
  usage.cacheFromStatusline({
    rate_limits: { five_hour: { used_percentage: 10, resets_at: 1 } },
    cost: { total_cost_usd: 1.23, total_lines_added: 10, total_lines_removed: 2, total_duration_ms: 5000 },
    model: { display_name: 'Opus' },
  }, root);
  const c = usage.readCache(root);
  assert.equal(c.cost, 1.23);
  assert.equal(c.model, 'Opus');
  assert.deepEqual(c.lines, { added: 10, removed: 2 });
  assert.equal(c.durationMs, 5000);
  fs.rmSync(root, { recursive: true, force: true });
});
