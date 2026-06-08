#!/usr/bin/env node
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const state = require('../core/state');

const PLUGIN_ROOT = path.resolve(__dirname, '..');

// Auto-HUD: keep the statusline + arena live without manual /slime:setup or
// /slime:arena. Both are best-effort and fail-soft — never block, never throw out
// of here, Observer Principle intact. Disable with "autoHud": false in
// ~/.claude/slime/config.json.
function autoHudEnabled() {
  try {
    const cfgPath = path.join(state.ROOT, 'config.json');
    const cfg = /** @type {{ autoHud?: unknown }} */ (require('../core/safe-io').readJson(cfgPath, {}) || {});
    return cfg.autoHud !== false; // default on
  } catch { return true; }
}

// Install Slime's statusline into the user's settings.json if — and only if — no
// statusLine is configured yet (never clobber an existing one). Claude only;
// Codex has no stable statusline equivalent.
function ensureStatusline() {
  if (String(process.env.SLIME_HARNESS || '').toLowerCase() === 'codex') return;
  const dir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  const settingsPath = path.join(dir, 'settings.json');
  const io = require('../core/safe-io');
  // Parse directly so a corrupt/half-written file is distinguishable from absent:
  // readJson would mask both as {} and we'd then clobber real settings. Only write
  // when the file is absent or parses to a real object that has no statusLine.
  let obj = {};
  if (fs.existsSync(settingsPath)) {
    try { obj = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); }
    catch { return; } // unreadable → never overwrite
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
    if (obj.statusLine) return; // respect whatever is already there
  }
  obj.statusLine = { type: 'command', command: `node "${path.join(PLUGIN_ROOT, 'scripts', 'statusline.js')}"` };
  io.safeWrite(settingsPath, JSON.stringify(obj, null, 2));
}

// Launch the local arena server (detached) unless one is already live, so the
// statusline [HUD] link is always clickable. serve.js exits cleanly on a busy
// port and only the owning process clears its marker, so duplicate launches are
// harmless.
function ensureArena() {
  const arenaStatus = require('../core/arena-status');
  if (arenaStatus.readLive()) return;
  const { spawn } = require('node:child_process');
  spawn(process.execPath, [path.join(__dirname, 'serve.js')], {
    detached: true, stdio: 'ignore',
    env: { ...process.env, SLIME_PORT: process.env.SLIME_PORT || '4117' },
  }).unref();
}

try {
  const p = state.readStdin();
  if (p && p.session_id) {
    const autoOn = autoHudEnabled();
    if (autoOn) {
      try { ensureStatusline(); } catch {}
      try { ensureArena(); } catch {}
    }
    /** @type {string[]} */
    let gear = [];
    try {
      const cache = process.env.CLAUDE_CONFIG_DIR
        ? path.join(process.env.CLAUDE_CONFIG_DIR, 'plugins', 'cache')
        : path.join(os.homedir(), '.claude', 'plugins', 'cache');
      gear = fs.readdirSync(cache).flatMap((mp) => {
        try { return fs.readdirSync(path.join(cache, mp)).filter((n) => !n.startsWith('.')); } catch { return []; }
      });
    } catch {}
    state.writeSnapshot(p.session_id, {
      sessionId: p.session_id, turn: 0, combo: 0, kills: 0, dmg: 0,
      summons: 0, gear, inTurn: false, updated: Date.now(),
      lastText: '⚔️ Slime — awaiting first encounter',
    });
    // Display-only systemMessages (Observer Principle intact): a one-line hint to
    // open the live arena, plus any available update notice.
    const msgs = [];
    if (autoOn) {
      try {
        const locale = require('../core/locale');
        msgs.push(locale.t('hud.openHint', locale.current()));
      } catch {}
    }
    const upd = require('../core/update-check').checkUpdate();
    if (upd) {
      const { sanitize } = require('../core/hud');
      const lines = upd.subjects.map((s) => ` · ${sanitize(s, 80)}`).join('\n');
      msgs.push(`⬆️ Slime update available (${upd.count} commit${upd.count > 1 ? 's' : ''}):\n${lines}\nSay "更新slime" or run /slime:update.`);
    }
    if (msgs.length) process.stdout.write(JSON.stringify({ systemMessage: msgs.join('\n\n') }));
  }
} catch {}
process.exit(0);
