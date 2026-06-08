const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'slime-'));
process.env.SLIME_ROOT = ROOT;
const ENV = { ...process.env, SLIME_ROOT: ROOT };
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
  assert.match(snap.boss.name, /^The [A-Za-z-]+ Myapp Bugbear$/);
});

test('prompt hook encounter event has numeric est', () => {
  run('hook-prompt.js', { session_id: 'h3', prompt: '1. do thing\n2. do more', cwd: '/tmp/myapp' });
  const lines = fs.readFileSync(path.join(ROOT, 'sessions', 'h3.jsonl'), 'utf8').trim().split('\n');
  const evs = lines.map((l) => JSON.parse(l));
  const enc = evs.find((e) => e.kind === 'encounter');
  assert.ok(enc);
  assert.equal(typeof enc.est, 'number');
  assert.ok(enc.est >= 20000);
  assert.equal(typeof enc.bossName, 'string');
  assert.ok(enc.bossName.length > 0);
});

test('stop hook emits systemMessage card and resets inTurn', () => {
  const out = run('hook-stop.js', { session_id: 'h1', cwd: '/tmp/myapp' });
  const msg = JSON.parse(out);
  assert.match(msg.systemMessage, /TURN #/);
  assert.doesNotMatch(msg.systemMessage, /Pixel Arena|Arena live/);
  const snap = JSON.parse(fs.readFileSync(path.join(ROOT, 'sessions', 'h1.json'), 'utf8'));
  assert.equal(snap.inTurn, false);
});

test('codex stop hook appends arena hint when no live arena exists', () => {
  const out = execFileSync('node', [S('hook-stop.js')], {
    input: JSON.stringify({ session_id: 'codex1', cwd: '/tmp/codex-ui' }),
    env: { ...ENV, SLIME_HARNESS: 'codex', SLIME_ARENA_MARKER: path.join(ROOT, 'missing-arena.json') },
  }).toString();
  const msg = JSON.parse(out);
  assert.match(msg.systemMessage, /Pixel Arena/);
  assert.match(msg.systemMessage, /\/slime:arena/);
});

test('codex stop hook appends live arena link when marker is alive', () => {
  const marker = path.join(ROOT, 'live-arena.json');
  fs.writeFileSync(marker, JSON.stringify({ port: 4555, pid: process.pid }));
  const out = execFileSync('node', [S('hook-stop.js')], {
    input: JSON.stringify({ session_id: 'codex2', cwd: '/tmp/codex-ui-live' }),
    env: { ...ENV, SLIME_HARNESS: 'codex', SLIME_ARENA_MARKER: marker },
  }).toString();
  const msg = JSON.parse(out);
  assert.match(msg.systemMessage, /Arena live/);
  assert.match(msg.systemMessage, /http:\/\/127\.0\.0\.1:4555/);
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

test('TodoWrite: completed todos emit minion_down; snap.todos carries rail data', () => {
  run('hook-posttool.js', {
    session_id: 'm1', cwd: '/tmp/my-survivor-game', tool_name: 'TodoWrite',
    tool_input: { todos: [
      { content: 'write tests', activeForm: 'writing tests', status: 'completed' },
      { content: 'fix bug', activeForm: 'fixing bug', status: 'in_progress' },
      { content: 'docs', activeForm: 'writing docs', status: 'pending' },
    ] }, tool_response: {},
  });
  const evs = fs.readFileSync(path.join(ROOT, 'sessions', 'm1.jsonl'), 'utf8')
    .trim().split('\n').map((l) => JSON.parse(l));
  const kills = evs.filter((e) => e.kind === 'minion_down');
  assert.equal(kills.length, 1);
  assert.match(kills[0].minion, /^MSG (mob 1|·小兵 1)$/u);
  const snap = JSON.parse(fs.readFileSync(path.join(ROOT, 'sessions', 'm1.json'), 'utf8'));
  assert.equal(snap.todos.length, 3);
  assert.equal(snap.todos[1].status, 'in_progress');
  assert.equal(typeof snap.todos[0].form, 'number');
});

test('TodoWrite: re-sending same completed todo emits nothing new', () => {
  run('hook-posttool.js', {
    session_id: 'm1', cwd: '/tmp/my-survivor-game', tool_name: 'TodoWrite',
    tool_input: { todos: [
      { content: 'write tests', activeForm: 'writing tests', status: 'completed' },
      { content: 'fix bug', activeForm: 'fixing bug', status: 'in_progress' },
      { content: 'docs', activeForm: 'writing docs', status: 'pending' },
    ] }, tool_response: {},
  });
  const evs = fs.readFileSync(path.join(ROOT, 'sessions', 'm1.jsonl'), 'utf8')
    .trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(evs.filter((e) => e.kind === 'minion_down').length, 1);
});

test('TodoWrite: >3 fresh kills collapse into one multi-kill event', () => {
  const todos = [1, 2, 3, 4, 5].map((i) => ({ content: `job ${i}`, activeForm: `doing ${i}`, status: 'completed' }));
  run('hook-posttool.js', {
    session_id: 'm2', cwd: '/tmp/web', tool_name: 'TodoWrite',
    tool_input: { todos }, tool_response: {},
  });
  const evs = fs.readFileSync(path.join(ROOT, 'sessions', 'm2.jsonl'), 'utf8')
    .trim().split('\n').map((l) => JSON.parse(l));
  const kills = evs.filter((e) => e.kind === 'minion_down');
  assert.equal(kills.length, 1);
  assert.equal(kills[0].count, 5);
});

test('stop hook auto-defeats a broken boss: milestone + boss_down + file gone', () => {
  run('hook-posttool.js', {
    session_id: 's9', cwd: '/tmp/auto', tool_name: 'TodoWrite',
    tool_input: { todos: [{ content: 'a', activeForm: 'a', status: 'completed' }] }, tool_response: {},
  });
  run('hook-stop.js', { session_id: 's9', cwd: '/tmp/auto' });
  const bossLib = require('../core/boss');
  assert.equal(fs.existsSync(bossLib.bossPath('/tmp/auto')), false);
  const evs = fs.readFileSync(path.join(ROOT, 'sessions', 's9.jsonl'), 'utf8')
    .trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(evs.filter((e) => e.kind === 'boss_down').length, 1);
  const prof = JSON.parse(fs.readFileSync(path.join(ROOT, 'profile.json'), 'utf8'));
  assert.ok(prof.milestones.some((m) => m.project === '/tmp/auto'));
});

test('stop hook leaves an unbroken boss alone', () => {
  run('hook-prompt.js', { session_id: 's10', prompt: 'fix thing', cwd: '/tmp/alive' });
  run('hook-stop.js', { session_id: 's10', cwd: '/tmp/alive' });
  const bossLib = require('../core/boss');
  assert.equal(fs.existsSync(bossLib.bossPath('/tmp/alive')), true);
});

test('TodoWrite: hp→0 sets broken, emits boss_broken, then auto-downs immediately', () => {
  // With auto-down-on-break: once the boss hits 0 hp and is broken, it is immediately
  // defeated (boss_down event, snap.boss cleared, boss file gone).
  run('hook-posttool.js', {
    session_id: 'm3', cwd: '/tmp/brk', tool_name: 'TodoWrite',
    tool_input: { todos: [{ content: 'a', activeForm: 'a', status: 'completed' }] }, tool_response: {},
  });
  const snap = JSON.parse(fs.readFileSync(path.join(ROOT, 'sessions', 'm3.json'), 'utf8'));
  // snap.boss is cleared by auto-down
  assert.ok(!snap.boss, 'snap.boss should be absent after auto-down');
  const evs = fs.readFileSync(path.join(ROOT, 'sessions', 'm3.jsonl'), 'utf8')
    .trim().split('\n').map((l) => JSON.parse(l));
  // boss_broken is emitted before the auto-down fires
  assert.equal(evs.filter((e) => e.kind === 'boss_broken').length, 1, 'exactly one boss_broken event');
  // boss_down is emitted by the auto-down block
  assert.equal(evs.filter((e) => e.kind === 'boss_down').length, 1, 'exactly one boss_down event');
  // boss file is gone
  const bossLib = require('../core/boss');
  assert.equal(fs.existsSync(bossLib.bossPath('/tmp/brk')), false, 'boss file should be cleared after auto-down');
});

test('edits drain boss hp from the code budget', () => {
  // Create boss via prompt (estLines seeded from estimateTokens)
  run('hook-prompt.js', { session_id: 'bdg1', prompt: 'fix login', cwd: '/tmp/budget' });
  // First edit: ~30 lines of dmg
  const lines30 = Array.from({ length: 30 }, (_, i) => `line${i}`).join('\n');
  run('hook-posttool.js', {
    session_id: 'bdg1', cwd: '/tmp/budget', tool_name: 'Edit',
    tool_input: { new_string: lines30 }, tool_response: {},
  });
  let snap = JSON.parse(fs.readFileSync(path.join(ROOT, 'sessions', 'bdg1.json'), 'utf8'));
  assert.ok(snap.boss.hp < 100, `hp should be < 100, got ${snap.boss.hp}`);
  assert.ok(snap.boss.hp > 0, `hp should be > 0 after 30 lines, got ${snap.boss.hp}`);
  const hp1 = snap.boss.hp;
  // Second bigger edit: another 30 lines → hp lower
  run('hook-posttool.js', {
    session_id: 'bdg1', cwd: '/tmp/budget', tool_name: 'Edit',
    tool_input: { new_string: lines30 }, tool_response: {},
  });
  snap = JSON.parse(fs.readFileSync(path.join(ROOT, 'sessions', 'bdg1.json'), 'utf8'));
  assert.ok(snap.boss.hp < hp1, `hp should decrease after second edit: ${snap.boss.hp} >= ${hp1}`);
});

test('all todos done with hp left → ultimate + broken + auto-downed immediately', () => {
  // Create boss via prompt (fresh, hp=100)
  run('hook-prompt.js', { session_id: 'ult1', prompt: 'add feature', cwd: '/tmp/ult' });
  // Send all-completed todos without draining hp first
  run('hook-posttool.js', {
    session_id: 'ult1', cwd: '/tmp/ult', tool_name: 'TodoWrite',
    tool_input: { todos: [
      { content: 'write tests', activeForm: 'writing', status: 'completed' },
      { content: 'ship it', activeForm: 'shipping', status: 'completed' },
    ] }, tool_response: {},
  });
  // With auto-down-on-break: snap.boss is cleared immediately after break
  const snap = JSON.parse(fs.readFileSync(path.join(ROOT, 'sessions', 'ult1.json'), 'utf8'));
  assert.ok(!snap.boss, 'snap.boss should be absent after auto-down');
  const evs = fs.readFileSync(path.join(ROOT, 'sessions', 'ult1.jsonl'), 'utf8')
    .trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(evs.filter((e) => e.kind === 'ultimate').length, 1, 'should have exactly one ultimate event');
  assert.equal(evs.filter((e) => e.kind === 'boss_broken').length, 1, 'should have exactly one boss_broken event');
  // auto-down fires immediately
  assert.equal(evs.filter((e) => e.kind === 'boss_down').length, 1, 'should have exactly one boss_down event from auto-down');
});

// A live arena marker makes ensureArena() a no-op, so these exercise the
// statusline auto-install without spawning a real server.
function liveMarker() {
  const m = path.join(ROOT, `auto-marker-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(m, JSON.stringify({ port: 4117, pid: process.pid }));
  return m;
}

test('auto-HUD installs the statusline + emits the [HUD] open hint', () => {
  const cfgDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slime-cfg-'));
  const out = execFileSync('node', [S('hook-sessionstart.js')], {
    input: JSON.stringify({ session_id: 'auto1' }),
    env: { ...ENV, CLAUDE_CONFIG_DIR: cfgDir, SLIME_ARENA_MARKER: liveMarker() },
  }).toString();
  const settings = JSON.parse(fs.readFileSync(path.join(cfgDir, 'settings.json'), 'utf8'));
  assert.match(settings.statusLine.command, /statusline\.js/);
  assert.match(JSON.parse(out).systemMessage, /Cmd\+Click.*\[HUD\]/);
});

test('auto-HUD never clobbers an existing statusLine', () => {
  const cfgDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slime-cfg-'));
  fs.writeFileSync(path.join(cfgDir, 'settings.json'),
    JSON.stringify({ statusLine: { type: 'command', command: 'mine' } }));
  execFileSync('node', [S('hook-sessionstart.js')], {
    input: JSON.stringify({ session_id: 'auto2' }),
    env: { ...ENV, CLAUDE_CONFIG_DIR: cfgDir, SLIME_ARENA_MARKER: liveMarker() },
  });
  const settings = JSON.parse(fs.readFileSync(path.join(cfgDir, 'settings.json'), 'utf8'));
  assert.equal(settings.statusLine.command, 'mine');
});

test('auto-HUD respects "autoHud": false', () => {
  const cfgDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slime-cfg-'));
  const offRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'slime-off-'));
  fs.writeFileSync(path.join(offRoot, 'config.json'), JSON.stringify({ autoHud: false }));
  execFileSync('node', [S('hook-sessionstart.js')], {
    input: JSON.stringify({ session_id: 'auto3' }),
    env: { ...ENV, SLIME_ROOT: offRoot, CLAUDE_CONFIG_DIR: cfgDir, SLIME_ARENA_MARKER: liveMarker() },
  });
  assert.equal(fs.existsSync(path.join(cfgDir, 'settings.json')), false);
});
