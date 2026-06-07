const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.CCQ_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'ccq-'));
const boss = require('../scripts/lib/boss');

test('nameBoss classifies task type from prompt keywords', () => {
  assert.equal(boss.nameBoss('fix the login crash', '/p/questline'), 'The Questline Bugbear');
  assert.equal(boss.nameBoss('refactor auth module', '/p/api'), 'The Api Colossus');
  assert.equal(boss.nameBoss('add dark mode', '/p/web'), 'The Web Hydra');
  assert.equal(boss.nameBoss('whatever else', '/p/web'), 'The Web Golem');
});

test('hpFromTodos: no todos = 100, half done = 50, all done = 0', () => {
  assert.equal(boss.hpFromTodos([]), 100);
  assert.equal(boss.hpFromTodos([
    { status: 'completed' }, { status: 'pending' }
  ]), 50);
  assert.equal(boss.hpFromTodos([{ status: 'completed' }]), 0);
});

test('boss store persists per cwd', () => {
  const b = boss.loadOrCreate('/p/web', 'add dark mode');
  assert.equal(b.name, 'The Web Hydra');
  b.hp = 40;
  boss.save('/p/web', b);
  assert.equal(boss.loadOrCreate('/p/web', 'ignored').hp, 40);
});
