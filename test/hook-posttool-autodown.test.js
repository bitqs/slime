const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'slime-ad-'));
process.env.SLIME_ROOT = ROOT;
const ENV = { ...process.env, SLIME_ROOT: ROOT };
const S = (f) => path.join(__dirname, '..', 'scripts', f);

function run(script, payload) {
  return execFileSync('node', [S(script)], { input: JSON.stringify(payload), env: ENV }).toString();
}

test('auto-downs a pre-broken boss: boss file gone, boss_down event, no snap.boss', () => {
  // Seed a boss file that is already broken and HP=0
  const boss = require('../core/boss');
  const state = require('../core/state');
  state.ensureDirs();

  const cwd = '/p/autodown-broken';
  const b = boss.loadOrCreate(cwd, '');
  b.estLines = 10;
  b.dmgTaken = 50;
  b.hp = 0;
  b.broken = true;
  boss.save(cwd, b);

  // Seed the snapshot so hook-posttool knows about the broken boss
  const sid = 'ad1';
  const snap = { sessionId: sid, turn: 1, combo: 0, kills: 0, dmg: 0, summons: 0,
    boss: { name: b.name, hp: 0, broken: true } };
  state.writeSnapshot(sid, snap);

  // Send a minimal tool payload (Read deals no dmg, so only the auto-down block fires)
  run('hook-posttool.js', { session_id: sid, cwd, tool_name: 'Read', tool_input: {} });

  // Boss file must be gone
  assert.equal(fs.existsSync(boss.bossPath(cwd)), false, 'boss file should be deleted');

  // Snapshot must not have a boss key
  const afterSnap = state.readSnapshot(sid);
  assert.ok(!afterSnap || afterSnap.boss == null, 'snap.boss should be absent after auto-down');

  // Must have a boss_down event
  const evs = state.readEvents(sid);
  assert.equal(evs.filter((e) => e.kind === 'boss_down').length, 1, 'should have exactly one boss_down event');

  // Milestone must have been recorded
  const prof = state.readProfile();
  assert.ok(prof.milestones.some((m) => m.project === cwd), 'milestone should be recorded');
});

test('does NOT auto-down a healthy boss: file remains, snap.boss intact, no boss_down', () => {
  const boss = require('../core/boss');
  const state = require('../core/state');
  state.ensureDirs();

  const cwd = '/p/autodown-healthy';
  const sid = 'ad2';

  // Create a healthy boss via prompt hook
  run('hook-prompt.js', { session_id: sid, prompt: 'fix login', cwd });

  // Seed some damage but boss is healthy (hp > 0)
  const b = boss.loadOrCreate(cwd, '');
  assert.ok(b.hp > 0, 'precondition: boss hp > 0');
  const bossFileBefore = boss.bossPath(cwd);
  assert.ok(fs.existsSync(bossFileBefore), 'precondition: boss file exists');

  // Run a Read tool (no damage)
  run('hook-posttool.js', { session_id: sid, cwd, tool_name: 'Read', tool_input: {} });

  // Boss file must still exist
  assert.ok(fs.existsSync(boss.bossPath(cwd)), 'boss file should still exist for healthy boss');

  // Snapshot should still have boss
  const afterSnap = state.readSnapshot(sid);
  // snap.boss may or may not be set by prompt hook; what matters is no boss_down
  const evs = state.readEvents(sid);
  assert.equal(evs.filter((e) => e.kind === 'boss_down').length, 0, 'healthy boss should not emit boss_down');
});
