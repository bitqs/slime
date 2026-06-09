const { test } = require('node:test');
const assert = require('node:assert');

const { withHookPayload } = require('../core/hook-runner');

test('withHookPayload skips empty payloads', () => {
  let called = false;
  assert.equal(withHookPayload(() => { called = true; }, null), false);
  assert.equal(called, false);
});

test('withHookPayload catches handler failures', () => {
  assert.equal(withHookPayload(() => { throw new Error('boom'); }, { session_id: 'h' }), false);
});

test('withHookPayload runs valid payloads', () => {
  let sid = '';
  assert.equal(withHookPayload((p) => { sid = p.session_id; }, { session_id: 'ok' }), true);
  assert.equal(sid, 'ok');
});
