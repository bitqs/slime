#!/usr/bin/env node
/** @typedef {import('../core/types').Snapshot} Snapshot */
const state = require('../core/state');
const locale = require('../core/locale');
const { runHook } = require('../core/hook-runner');

runHook((p) => {
  if (p && p.session_id) {
    /** @type {Snapshot} */
    const snap = state.readSnapshot(p.session_id) || /** @type {Snapshot} */ ({ sessionId: p.session_id, turn: 0, combo: 0, kills: 0, dmg: 0, summons: 0 });
    snap.lastText = locale.t('potion', locale.current());
    snap.updated = Date.now();
    state.appendEvent(p.session_id, { t: Date.now(), kind: 'potion', text: snap.lastText });
    state.writeSnapshot(p.session_id, snap);
  }
});
