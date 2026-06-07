#!/usr/bin/env node
const fs = require('node:fs');
const state = require('./lib/state');
const report = require('./lib/report');
const boss = require('./lib/boss');
try {
  const p = state.readStdin();
  if (p && p.session_id) {
    const id = p.session_id;
    const snap = state.readSnapshot(id) || { sessionId: id, turn: 1 };
    const events = state.readEvents(id);
    const agg = report.aggregate(events);
    const b = p.cwd ? boss.loadOrCreate(p.cwd, '') : null;
    const card = report.render(agg, b && { name: b.name, hp: b.hp }, snap);

    state.appendEvent(id, { t: Date.now(), kind: 'turn_end', text: card });
    state.ensureDirs();
    fs.appendFileSync(state.reportPath(id), card + '\n\n');

    snap.inTurn = false;
    snap.combo = 0;
    snap.lastText = `🏆 Turn ${snap.turn} complete — Rank ${report.rank(agg)}`;
    snap.updated = Date.now();
    state.writeSnapshot(id, snap);

    const prof = state.readProfile();
    prof.totals.turns += 1;
    prof.totals.dmg += agg.dmg;
    prof.totals.kills += agg.kills;
    state.writeProfile(prof);

    // the only user-visible hook output: the turn report (display only)
    process.stdout.write(JSON.stringify({ systemMessage: card }));
  }
} catch {}
process.exit(0);
