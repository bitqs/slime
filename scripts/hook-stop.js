#!/usr/bin/env node
/** @typedef {import('./lib/types').HookPayload} HookPayload */
/** @typedef {import('./lib/types').Snapshot} Snapshot */
/** @typedef {import('./lib/types').UsageCache} UsageCache */
const state = require('./lib/state');
const report = require('./lib/report');
const boss = require('./lib/boss');
const usage = require('./lib/usage');
const sage = require('./lib/sage');
const locale = require('./lib/locale');
try {
  /** @type {HookPayload | null} */
  const p = /** @type {HookPayload | null} */ (state.readStdin());
  if (p && p.session_id) {
    const id = p.session_id;
    /** @type {Snapshot} */
    const snap = state.readSnapshot(id) || /** @type {Snapshot} */ ({ sessionId: id, turn: 1, combo: 0, kills: 0, dmg: 0, summons: 0 });
    const events = state.readEvents(id);
    const agg = report.aggregate(events);
    const b = p.cwd ? boss.loadOrCreate(p.cwd, '') : null;
    const u = usage.readCache();
    const lang = locale.current();
    const sageLine = sage.advise({ usage: u, bossHp: b ? b.hp : null, lang });
    // boss name is user-prompt- or LLM-derived — sanitize before terminal display
    const { sanitize } = require('./lib/hud');
    const card = report.render(agg, b && { name: sanitize(b.name), hp: b.hp }, snap, { usage: u, sageLine: sageLine ?? undefined, lang });

    if (b && p.cwd) {
      b.turns = snap.turn || 0;
      if (b.broken) {
        // all todos done and still broken at stop → confirmed kill, no typing needed
        const total = boss.recordDefeat(p.cwd, b);
        state.appendEvent(id, { t: Date.now(), kind: 'boss_down', boss: b.name,
          text: locale.fmt(locale.t('boss.autoDown', lang), { name: b.name, count: total }) });
        delete snap.boss;
        delete snap.todos;
      } else {
        boss.save(p.cwd, b);
      }
    }

    state.appendEvent(id, { t: Date.now(), kind: 'turn_end', text: card });
    state.ensureDirs();
    require('./lib/safe-io').safeAppend(state.reportPath(id), card + '\n\n');

    snap.inTurn = false;
    snap.combo = 0;
    snap.lastText = locale.fmt(locale.t('turn.complete', lang), { turn: snap.turn, rank: report.rank(agg) });
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
