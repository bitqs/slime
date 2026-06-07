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
  }
} catch {}
process.exit(0);
