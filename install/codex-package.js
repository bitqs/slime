'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_OUT_DIR = path.join(REPO_ROOT, 'dist', 'slime');

const FILES = [
  '.codex-plugin/plugin.json',
  'hooks.json',
  'package.json',
  'README.md',
  'LICENSE',

  'commands/achievements.md',
  'commands/arena.md',
  'commands/battlelog.md',
  'commands/defeat.md',
  'commands/milestones.md',
  'commands/setup.md',
  'commands/update.md',
  'commands/wrapped.md',

  'skills/slime-codex/SKILL.md',
  'skills/slime-codex/agents/openai.yaml',

  'adapters/codex/adapter.js',
  'adapters/codex/manifest.json',
  'adapters/codex/fixtures/post-tool-write.json',
  'adapters/codex/fixtures/statusline.json',

  'core/arena-status.js',
  'core/boss.js',
  'core/estimate.js',
  'core/hud.js',
  'core/locale.js',
  'core/mapper.js',
  'core/progression.js',
  'core/report.js',
  'core/safe-io.js',
  'core/sage.js',
  'core/state.js',
  'core/update-check.js',
  'core/usage.js',

  'data/badges.json',
  'data/config.default.json',
  'data/locales/en.json',
  'data/locales/zh.json',
  'data/tips.json',
  'data/tips.zh.json',

  'public/index.html',
  'public/arena.js',
  'public/minions.js',
  'public/sequencer.js',
  'public/vendor/VERSION',
  'public/vendor/pixi.min.js',

  'scripts/achievements.js',
  'scripts/battlelog.js',
  'scripts/defeat.js',
  'scripts/dispatch.js',
  'scripts/hook-posttool.js',
  'scripts/hook-precompact.js',
  'scripts/hook-pretool.js',
  'scripts/hook-prompt.js',
  'scripts/hook-sessionstart.js',
  'scripts/hook-stop.js',
  'scripts/hook-subagentstop.js',
  'scripts/milestones.js',
  'scripts/namer.js',
  'scripts/serve.js',
  'scripts/statusline.js',
  'scripts/watch.js',
  'scripts/wrapped.js',
];

function assertInsideRepo(target) {
  const resolved = path.resolve(target);
  const rel = path.relative(REPO_ROOT, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Refusing to write outside repo: ${target}`);
  }
  return resolved;
}

function copyFile(rel, outDir) {
  const src = path.join(REPO_ROOT, rel);
  const dest = path.join(outDir, rel);
  if (!fs.statSync(src).isFile()) {
    throw new Error(`Missing package input: ${rel}`);
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function buildCodexPackage(outDir = DEFAULT_OUT_DIR) {
  const target = assertInsideRepo(outDir);
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });
  for (const file of FILES) copyFile(file, target);
  return { outDir: target, files: [...FILES] };
}

if (require.main === module) {
  const outArg = process.argv[2] || DEFAULT_OUT_DIR;
  const result = buildCodexPackage(outArg);
  console.log(`Codex plugin package written to ${result.outDir}`);
  console.log(`${result.files.length} files`);
}

module.exports = {
  DEFAULT_OUT_DIR,
  FILES,
  buildCodexPackage,
};
