#!/usr/bin/env node
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const state = require('./lib/state');
try {
  const p = state.readStdin();
  if (p && p.session_id) {
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
      lastText: '⚔️ Questline — awaiting first encounter',
    });
    // Update notice — display-only systemMessage; Observer Principle intact.
    const upd = require('./lib/update-check').checkUpdate();
    if (upd) {
      const { sanitize } = require('./lib/hud');
      const lines = upd.subjects.map((s) => ` · ${sanitize(s, 80)}`).join('\n');
      process.stdout.write(JSON.stringify({
        systemMessage: `⬆️ Questline update available (${upd.count} commit${upd.count > 1 ? 's' : ''}):\n${lines}\nSay "更新questline" or run /questline:update.`,
      }));
    }
  }
} catch {}
process.exit(0);
