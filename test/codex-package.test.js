'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { FILES, buildCodexPackage } = require('../install/codex-package');

const ROOT = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

test('codex package allowlist covers hooks, commands, and arena assets', () => {
  const files = new Set(FILES);

  const hooks = JSON.parse(read('hooks.json'));
  for (const configs of Object.values(hooks.hooks)) {
    for (const config of configs) {
      for (const hook of config.hooks) {
        for (const match of hook.command.matchAll(/\.\/(scripts\/[A-Za-z0-9._-]+\.js)/g)) {
          assert.ok(files.has(match[1]), `${match[1]} from hooks.json is packaged`);
        }
      }
    }
  }

  for (const command of fs.readdirSync(path.join(ROOT, 'commands')).filter((name) => name.endsWith('.md'))) {
    const body = read(path.join('commands', command));
    for (const match of body.matchAll(/(?:CLAUDE_PLUGIN_ROOT}|<PLUGIN_ROOT>)\/(scripts\/[A-Za-z0-9._-]+\.js)/g)) {
      assert.ok(files.has(match[1]), `${match[1]} from commands/${command} is packaged`);
    }
  }

  const serve = read('scripts/serve.js');
  for (const match of serve.matchAll(/'\/([^']+)'/g)) {
    if (match[1].endsWith('.js')) {
      assert.ok(files.has(path.join('public', match[1])), `${match[1]} from serve whitelist is packaged`);
    }
  }
});

test('codex package build excludes development-only directories', () => {
  const out = path.join(ROOT, 'dist', 'codex-package-test');
  const result = buildCodexPackage(out);

  assert.equal(result.outDir, out);
  assert.ok(fs.existsSync(path.join(out, '.codex-plugin/plugin.json')));
  assert.ok(fs.existsSync(path.join(out, 'hooks.json')));
  assert.ok(fs.existsSync(path.join(out, 'public/vendor/pixi.min.js')));
  assert.ok(!fs.existsSync(path.join(out, '.git')));
  assert.ok(!fs.existsSync(path.join(out, 'node_modules')));
  assert.ok(!fs.existsSync(path.join(out, 'test')));
  assert.ok(!fs.existsSync(path.join(out, 'docs')));
  assert.ok(!fs.existsSync(path.join(out, '.claude-plugin')));
});
