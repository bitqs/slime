#!/usr/bin/env node
const state = require('./lib/state');
try {
  const p = state.readStdin();
  if (p && p.session_id) {
    const snap = state.readSnapshot(p.session_id);
    if (snap) {
      snap.summons = Math.max(0, (snap.summons || 0) - 1);
      snap.lastText = '🐺 A summon returns from the hunt';
      snap.updated = Date.now();
      state.appendEvent(p.session_id, { t: Date.now(), kind: 'summon_back', text: snap.lastText });
      state.writeSnapshot(p.session_id, snap);
    }
  }
} catch {}
process.exit(0);
