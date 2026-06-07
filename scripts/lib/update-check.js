'use strict';
// update-check — session-start "what's new" for directory-sourced installs.
// GitHub-sourced installs are skipped: no network at session start; the
// official auto-updater covers them. Best-effort: every failure → null.
const { execFileSync } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');
const { readJson } = require('./safe-io');

/**
 * @typedef {{
 *   plugins?: Record<string, [{ gitCommitSha?: string }?, ...unknown[]]>;
 * }} InstalledPlugins
 *
 * @typedef {{
 *   extraKnownMarketplaces?: Record<string, { source?: { source?: string; path?: string } }>;
 * }} ClaudeSettings
 */

/** @param {string} dir @param {string[]} args @returns {string} */
function git(dir, args) {
  return execFileSync('git', ['-C', dir, ...args], {
    timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'],
  }).toString().trim();
}

// cfgDirOverride is for tests; production callers pass nothing.
/** @param {string} [cfgDirOverride] @returns {{ count: number; subjects: string[] } | null} */
function checkUpdate(cfgDirOverride) {
  try {
    const cfgDir = cfgDirOverride
      || process.env.CLAUDE_CONFIG_DIR
      || path.join(os.homedir(), '.claude');
    const installed = /** @type {InstalledPlugins | null} */ (readJson(path.join(cfgDir, 'plugins', 'installed_plugins.json'), null));
    const entry = installed && installed.plugins && installed.plugins['questline@questline'];
    const sha = entry && entry[0] && entry[0].gitCommitSha;
    if (!sha) return null;
    const settings = /** @type {ClaudeSettings | null} */ (readJson(path.join(cfgDir, 'settings.json'), null));
    const mp = settings && settings.extraKnownMarketplaces && settings.extraKnownMarketplaces.questline;
    if (!mp || !mp.source || mp.source.source !== 'directory' || !mp.source.path) return null;
    const head = git(mp.source.path, ['rev-parse', 'HEAD']);
    if (!head || head === sha) return null;
    const log = git(mp.source.path, ['log', '--oneline', `${sha}..HEAD`]);
    if (!log) return null;
    const lines = log.split('\n');
    return { count: lines.length, subjects: lines.slice(0, 5) };
  } catch { return null; }
}

module.exports = { checkUpdate };
