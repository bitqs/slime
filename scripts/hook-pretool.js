#!/usr/bin/env node
const state = require('./lib/state');
const mapper = require('./lib/mapper');
const locale = require('./lib/locale');
try {
  const p = state.readStdin();
  if (p && p.session_id) {
    const id = p.session_id;
    const snap = state.readSnapshot(id) || { sessionId: id, turn: 0, combo: 0, kills: 0, dmg: 0, summons: 0 };
    snap.casts = (snap.casts || 0) + 1;
    const ev = mapper.cast(p, snap.casts, locale.current());
    state.appendEvent(id, ev);
    const t = (p.tool_name || '').toLowerCase();
    if (t === 'agent' || t === 'task') {
      snap.summons = (snap.summons || 0) + 1;
    }
    if ((p.tool_name || '') === 'Skill' && p.tool_input && p.tool_input.skill) {
      const plugin = String(p.tool_input.skill).split(':')[0];
      const prof = state.readProfile();
      prof.gearUse = prof.gearUse || {};
      prof.gearUse[plugin] = (prof.gearUse[plugin] || 0) + 1;
      state.writeProfile(prof);
    }
    snap.inTurn = true;
    snap.lastText = ev.text;
    snap.updated = Date.now();
    state.writeSnapshot(id, snap);
  }
} catch {}
process.exit(0);
