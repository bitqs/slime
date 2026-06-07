#!/usr/bin/env node
const state = require('./lib/state');
const boss = require('./lib/boss');
try {
  const p = state.readStdin();
  if (p && p.session_id) {
    const id = p.session_id;
    const snap = state.readSnapshot(id) || { sessionId: id, turn: 0, combo: 0, kills: 0, dmg: 0, summons: 0 };
    snap.turn = (snap.turn || 0) + 1;
    snap.inTurn = true;
    const b = boss.loadOrCreate(p.cwd || '', p.prompt || '');
    boss.save(p.cwd || '', b);
    snap.boss = { name: b.name, hp: b.hp };
    state.appendEvent(id, { t: Date.now(), kind: 'encounter', text: `⚡ Turn ${snap.turn} — ${b.name} (${b.hp}% HP)` });
    snap.lastText = `⚡ ${b.name} appears!`;
    snap.updated = Date.now();
    state.writeSnapshot(id, snap);
  }
} catch {}
process.exit(0);
