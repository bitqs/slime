const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

test('package exposes a one-command arena demo', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts.demo, 'node scripts/demo.js');
  const demo = fs.readFileSync(path.join(ROOT, 'scripts', 'demo.js'), 'utf8');
  assert.match(demo, /demo-feed\.js/);
  assert.match(demo, /serve\.js/);
  assert.match(demo, /SLIME_PORT/);
});
