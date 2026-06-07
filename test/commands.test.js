const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'ccq-'));
const ENV = { ...process.env, CCQ_ROOT: ROOT };
const S = (f) => path.join(__dirname, '..', 'scripts', f);

test('defeat records milestone and clears boss', () => {
  // seed a boss for cwd
  process.env.CCQ_ROOT = ROOT;
  const boss = require('../scripts/lib/boss');
  const b = boss.loadOrCreate('/tmp/myapp', 'fix bug');
  b.hp = 10; b.turns = 4;
  boss.save('/tmp/myapp', b);

  const out = execFileSync('node', [S('defeat.js'), '/tmp/myapp'], { env: ENV }).toString();
  assert.match(out, /DEFEATED/);
  assert.match(out, /The Myapp Bugbear/);

  const prof = JSON.parse(fs.readFileSync(path.join(ROOT, 'profile.json'), 'utf8'));
  assert.equal(prof.milestones.length, 1);
  assert.equal(prof.milestones[0].boss, 'The Myapp Bugbear');
  assert.ok(!fs.existsSync(boss.bossPath('/tmp/myapp')));
});

test('defeat with no boss says so', () => {
  const out = execFileSync('node', [S('defeat.js'), '/tmp/empty'], { env: ENV }).toString();
  assert.match(out, /No boss/i);
});

test('milestones renders the wall', () => {
  const out = execFileSync('node', [S('milestones.js')], { env: ENV }).toString();
  assert.match(out, /The Myapp Bugbear/);
  assert.match(out, /MILESTONE WALL/);
});
