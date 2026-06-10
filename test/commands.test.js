const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'slime-'));
const ENV = { ...process.env, SLIME_ROOT: ROOT };
const S = (f) => path.join(__dirname, '..', 'scripts', f);

test('defeat records milestone and clears boss', () => {
  // seed a boss for cwd
  process.env.SLIME_ROOT = ROOT;
  const boss = require('../core/boss');
  const b = boss.loadOrCreate('/tmp/myapp', 'fix bug');
  b.hp = 10; b.turns = 4;
  boss.save('/tmp/myapp', b);

  const out = execFileSync('node', [S('defeat.js'), '/tmp/myapp'], { env: ENV }).toString();
  assert.match(out, /DEFEATED/);
  assert.match(out, /The [A-Za-z-]+ Myapp Glitch Slime/);

  const prof = JSON.parse(fs.readFileSync(path.join(ROOT, 'profile.json'), 'utf8'));
  assert.equal(prof.milestones.length, 1);
  assert.match(prof.milestones[0].boss, /^The [A-Za-z-]+ Myapp Glitch Slime$/);
  assert.ok(!fs.existsSync(boss.bossPath('/tmp/myapp')));
});

test('defeat with no boss says so', () => {
  const out = execFileSync('node', [S('defeat.js'), '/tmp/empty'], { env: ENV }).toString();
  assert.match(out, /No boss/i);
});

test('milestones renders the wall', () => {
  const out = execFileSync('node', [S('milestones.js')], { env: ENV }).toString();
  assert.match(out, /The [A-Za-z-]+ Myapp Glitch Slime/);
  assert.match(out, /MILESTONE WALL/);
});

test('namer renames boss file using injected command', () => {
  const boss = require('../core/boss');
  const b = boss.loadOrCreate('/tmp/namerapp', 'add feature x');
  boss.save('/tmp/namerapp', b);
  execFileSync('node', [S('namer.js'), '/tmp/namerapp', 'add feature x'], {
    env: { ...ENV, SLIME_NAMER_CMD: JSON.stringify(['node', '-e', "console.log('The Crimson Hydra of Namerapp')"]) },
  });
  assert.equal(boss.loadOrCreate('/tmp/namerapp', '').name, 'The Crimson Hydra of Namerapp');
});

test('defeat appends boss_down to the newest session', () => {
  const sid = 'deadbeef';
  fs.mkdirSync(path.join(ROOT, 'sessions'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'sessions', `${sid}.json`), '{}');

  const boss = require('../core/boss');
  const b = boss.loadOrCreate('/tmp/defeat-event-app', 'fix event');
  boss.save('/tmp/defeat-event-app', b);

  execFileSync('node', [S('defeat.js'), '/tmp/defeat-event-app'], { env: ENV });

  const lines = fs.readFileSync(path.join(ROOT, 'sessions', `${sid}.jsonl`), 'utf8').trim().split('\n');
  // a defeat may append boss_down then a level_up — find the boss_down, don't assume it's last
  const ev = lines.map((l) => JSON.parse(l)).find((e) => e.kind === 'boss_down');
  assert.ok(ev, 'boss_down event emitted');
  assert.ok(ev.boss);
});

test('slash commands document Claude Code state routing', () => {
  for (const name of ['arena', 'battlelog', 'milestones', 'wrapped']) {
    const doc = fs.readFileSync(path.join(__dirname, '..', 'commands', `${name}.md`), 'utf8');
    assert.match(doc, /CLAUDE_PLUGIN_ROOT/, `${name} command uses CLAUDE_PLUGIN_ROOT`);
  }
  const setup = fs.readFileSync(path.join(__dirname, '..', 'commands', 'setup.md'), 'utf8');
  assert.match(setup, /Claude Code only/);
});
