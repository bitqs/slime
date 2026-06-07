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

test('prompt hook encounter event has numeric est', () => {
  run('hook-prompt.js', { session_id: 'h3', prompt: '1. do thing\n2. do more', cwd: '/tmp/myapp' });
  const lines = fs.readFileSync(path.join(ROOT, 'sessions', 'h3.jsonl'), 'utf8').trim().split('\n');
  const evs = lines.map((l) => JSON.parse(l));
  const enc = evs.find((e) => e.kind === 'encounter');
  assert.ok(enc);
  assert.equal(typeof enc.est, 'number');
  assert.ok(enc.est >= 20000);
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

test('pretool counts Skill invocations as gear use in profile', () => {
  run('hook-pretool.js', {
    session_id: 'h1', tool_name: 'Skill', tool_input: { skill: 'superpowers:brainstorming' },
  });
  const prof = JSON.parse(fs.readFileSync(path.join(ROOT, 'profile.json'), 'utf8'));
  assert.equal(prof.gearUse['superpowers'], 1);
});

test('AskUserQuestion emits choice_open with question and labels', () => {
  const payload = {
    session_id: 'cho1', tool_name: 'AskUserQuestion',
    tool_input: { questions: [{ question: 'Pick a path', options: [{ label: 'Left' }, { label: 'Right' }] }] },
  };
  run('hook-pretool.js', payload);
  const lines = fs.readFileSync(path.join(ROOT, 'sessions', 'cho1.jsonl'), 'utf8').trim().split('\n');
  const evs = lines.map((l) => JSON.parse(l));
  const open = evs.find((e) => e.kind === 'choice_open');
  assert.ok(open);
  assert.equal(open.questions[0].q, 'Pick a path');
  assert.deepEqual(open.questions[0].opts, ['Left', 'Right']);
});

test('AskUserQuestion result emits choice_made with chosen labels', () => {
  const payload = {
    session_id: 'cho2', tool_name: 'AskUserQuestion',
    tool_input: { questions: [] },
    tool_response: { answers: { 'Pick a path': 'Left' } },
  };
  run('hook-posttool.js', payload);
  const lines = fs.readFileSync(path.join(ROOT, 'sessions', 'cho2.jsonl'), 'utf8').trim().split('\n');
  const evs = lines.map((l) => JSON.parse(l));
  const made = evs.find((e) => e.kind === 'choice_made');
  assert.ok(made);
  assert.deepEqual(made.chosen, ['Left']);
});

test('ExitPlanMode emits plan_scroll with truncated plan', () => {
  const payload = {
    session_id: 'pla1', tool_name: 'ExitPlanMode',
    tool_input: { plan: 'P'.repeat(3000) },
  };
  run('hook-pretool.js', payload);
  const lines = fs.readFileSync(path.join(ROOT, 'sessions', 'pla1.jsonl'), 'utf8').trim().split('\n');
  const evs = lines.map((l) => JSON.parse(l));
  const sc = evs.find((e) => e.kind === 'plan_scroll');
  assert.ok(sc);
  assert.ok(sc.plan.length <= 1500);
  assert.ok(sc.est >= 20000);
});

test('ExitPlanMode result emits plan_approved', () => {
  const payload = {
    session_id: 'pla2', tool_name: 'ExitPlanMode',
    tool_input: {}, tool_response: {},
  };
  run('hook-posttool.js', payload);
  const lines = fs.readFileSync(path.join(ROOT, 'sessions', 'pla2.jsonl'), 'utf8').trim().split('\n');
  const evs = lines.map((l) => JSON.parse(l));
  assert.ok(evs.find((e) => e.kind === 'plan_approved'));
});
