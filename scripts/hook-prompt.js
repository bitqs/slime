#!/usr/bin/env node
const state = require('./lib/state');
const boss = require('./lib/boss');
const locale = require('./lib/locale');
try {
  const p = state.readStdin();
  if (p && p.session_id) {
    try { locale.tally(p.prompt); } catch {}
    const id = p.session_id;
    const snap = state.readSnapshot(id) || { sessionId: id, turn: 0, combo: 0, kills: 0, dmg: 0, summons: 0 };
    snap.turn = (snap.turn || 0) + 1;
    snap.inTurn = true;
    const b = boss.loadOrCreate(p.cwd || '', p.prompt || '');
    boss.save(p.cwd || '', b);
    try {
      const cfgPath = require('node:path').join(state.ROOT, 'config.json');
      let cfg = {};
      try { cfg = JSON.parse(require('node:fs').readFileSync(cfgPath, 'utf8')); } catch {}
      if (cfg.haikuNaming && b.hp === 100 && !b.named) {
        b.named = true; boss.save(p.cwd || '', b);
        const { spawn } = require('node:child_process');
        spawn('node', [require('node:path').join(__dirname, 'namer.js'), p.cwd || '', p.prompt || ''],
          { detached: true, stdio: 'ignore' }).unref();
      }
    } catch {}
    snap.boss = { name: b.name, hp: b.hp };
    state.appendEvent(id, { t: Date.now(), kind: 'encounter', text: `⚡ Turn ${snap.turn} — ${b.name} (${b.hp}% HP)` });
    snap.lastText = `⚡ ${b.name} appears!`;
    snap.updated = Date.now();
    state.writeSnapshot(id, snap);
  }
} catch {}
process.exit(0);
