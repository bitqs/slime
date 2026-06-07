#!/usr/bin/env node
const state = require('./lib/state');
try {
  const p = state.readStdin();
  if (p && p.session_id) {
    const snap = state.readSnapshot(p.session_id) || { sessionId: p.session_id };
    snap.lastText = '🧪 Quaffs a memory potion (/compact) — mana refills, a scar remains';
    snap.updated = Date.now();
    state.appendEvent(p.session_id, { t: Date.now(), kind: 'potion', text: snap.lastText });
    state.writeSnapshot(p.session_id, snap);
  }
} catch {}
process.exit(0);
