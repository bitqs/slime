const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'ccq-'));
const ENV = { ...process.env, CCQ_ROOT: ROOT };
const S = (f) => path.join(__dirname, '..', 'scripts', f);

function run(script, payload) {
  return execFileSync('node', [S(script)], { input: JSON.stringify(payload), env: ENV }).toString();
}

test('pretool hook appends cast event and updates snapshot', () => {
  run('hook-pretool.js', {
    session_id: 'h1', tool_name: 'Grep', tool_input: { pattern: 'foo' },
  });
  const evs = fs.readFileSync(path.join(ROOT, 'sessions', 'h1.jsonl'), 'utf8');
  assert.match(evs, /\[Grep\]/);
  const snap = JSON.parse(fs.readFileSync(path.join(ROOT, 'sessions', 'h1.json'), 'utf8'));
  assert.equal(snap.inTurn, true);
  assert.match(snap.lastText, /\[Grep\]/);
});

test('posttool hook accumulates damage and combo in snapshot', () => {
  run('hook-posttool.js', {
    session_id: 'h1', tool_name: 'Edit',
    tool_input: { new_string: 'a\nb' }, tool_response: {},
  });
  const snap = JSON.parse(fs.readFileSync(path.join(ROOT, 'sessions', 'h1.json'), 'utf8'));
  assert.equal(snap.dmg, 2);
  assert.equal(snap.combo, 1);
});

test('prompt hook opens encounter and creates boss', () => {
  run('hook-prompt.js', { session_id: 'h2', prompt: 'fix login bug', cwd: '/tmp/myapp' });
  const snap = JSON.parse(fs.readFileSync(path.join(ROOT, 'sessions', 'h2.json'), 'utf8'));
  assert.equal(snap.boss.name, 'The Myapp Bugbear');
});

test('stop hook emits systemMessage card and resets inTurn', () => {
  const out = run('hook-stop.js', { session_id: 'h1', cwd: '/tmp/myapp' });
  const msg = JSON.parse(out);
  assert.match(msg.systemMessage, /TURN #/);
  const snap = JSON.parse(fs.readFileSync(path.join(ROOT, 'sessions', 'h1.json'), 'utf8'));
  assert.equal(snap.inTurn, false);
});

test('hooks never crash on garbage stdin (observer principle)', () => {
  for (const s of ['hook-pretool.js', 'hook-posttool.js', 'hook-prompt.js',
                   'hook-sessionstart.js', 'hook-subagentstop.js', 'hook-precompact.js',
                   'hook-stop.js']) {
    const out = execFileSync('node', [S(s)], { input: 'not json{{', env: ENV });
    assert.ok(out !== null); // exited 0, no throw
  }
});
