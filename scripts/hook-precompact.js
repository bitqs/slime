#!/usr/bin/env node
/** @typedef {import('../core/types').Snapshot} Snapshot */
const state = require('../core/state');
try {
  const p = state.readStdin();
  if (p && p.session_id) {
    /** @type {Snapshot} */
    const snap = state.readSnapshot(p.session_id) || /** @type {Snapshot} */ ({ sessionId: p.session_id, turn: 0, combo: 0, kills: 0, dmg: 0, summons: 0 });
    snap.lastText = '🧪 Quaffs a memory potion (/compact) — mana refills, a scar remains';
    snap.updated = Date.now();
    state.appendEvent(p.session_id, { t: Date.now(), kind: 'potion', text: snap.lastText });
    state.writeSnapshot(p.session_id, snap);
  }
} catch {}
process.exit(0);
