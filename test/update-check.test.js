'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { checkUpdate } = require('../scripts/lib/update-check');

function git(dir, ...args) {
  return execFileSync('git', ['-C', dir, ...args], { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString().trim();
}

const GIT_ENV = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };

function setupFixture() {
  const cfgDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slime-upd-cfg-'));
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'slime-upd-repo-'));
  execFileSync('git', ['-C', repo, 'init', '-q']);
  execFileSync('git', ['-C', repo, 'commit', '-q', '--allow-empty', '-m', 'feat: first'], { env: GIT_ENV });
  const sha = git(repo, 'rev-parse', 'HEAD');
  fs.mkdirSync(path.join(cfgDir, 'plugins'), { recursive: true });
  fs.writeFileSync(path.join(cfgDir, 'plugins', 'installed_plugins.json'), JSON.stringify({
    version: 2,
    plugins: { 'slime@slime': [{ scope: 'user', gitCommitSha: sha }] },
  }));
  fs.writeFileSync(path.join(cfgDir, 'settings.json'), JSON.stringify({
    extraKnownMarketplaces: { slime: { source: { source: 'directory', path: repo } } },
  }));
  return { cfgDir, repo };
}

test('checkUpdate returns null when installed == HEAD', () => {
  const { cfgDir } = setupFixture();
  assert.strictEqual(checkUpdate(cfgDir), null);
});

test('checkUpdate lists new commit subjects', () => {
  const { cfgDir, repo } = setupFixture();
  execFileSync('git', ['-C', repo, 'commit', '-q', '--allow-empty', '-m', 'feat: weapon skins'], { env: GIT_ENV });
  const upd = checkUpdate(cfgDir);
  assert.strictEqual(upd.count, 1);
  assert.match(upd.subjects[0], /feat: weapon skins/);
});

test('checkUpdate returns null for non-directory marketplace source', () => {
  const { cfgDir } = setupFixture();
  fs.writeFileSync(path.join(cfgDir, 'settings.json'), JSON.stringify({
    extraKnownMarketplaces: { slime: { source: { source: 'github', repo: 'bitqs/slime' } } },
  }));
  assert.strictEqual(checkUpdate(cfgDir), null);
});

test('checkUpdate silent-nulls on missing files', () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'slime-upd-empty-'));
  assert.strictEqual(checkUpdate(empty), null);
});
