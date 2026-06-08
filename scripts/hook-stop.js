#!/usr/bin/env node
/** @typedef {import('../core/types').HookPayload} HookPayload */
/** @typedef {import('../core/types').Snapshot} Snapshot */
/** @typedef {import('../core/types').UsageCache} UsageCache */
const state = require('../core/state');
const report = require('../core/report');
const boss = require('../core/boss');
const usage = require('../core/usage');
const sage = require('../core/sage');
const locale = require('../core/locale');

/** @param {string} lang @returns {string | null} */
function codexUiFooter(lang) {
  if (process.env.SLIME_HARNESS !== 'codex') return null;
  const live = require('../core/arena-status').readLive();
  if (live) {
    return locale.fmt(locale.t('codex.uiLive', lang), {
      url: `http://127.0.0.1:${live.port}`,
    });
  }
  return locale.t('codex.uiHint', lang);
}

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
    const { sanitize } = require('../core/hud');
    let card = report.render(agg, b && { name: sanitize(b.name), hp: b.hp }, snap, { usage: u, sageLine: sageLine ?? undefined, lang });
    const uiFooter = codexUiFooter(lang);
    if (uiFooter) card += `\n${uiFooter}`;

    if (b && p.cwd) {
      b.turns = snap.turn || 0;
      if (b.broken) {
        // all todos done and still broken at stop → confirmed kill, no typing needed
        const r = boss.recordDefeat(p.cwd, b, { dmg: agg.dmg, kills: agg.kills, maxCombo: agg.maxCombo });
        state.appendEvent(id, { t: Date.now(), kind: 'boss_down', boss: b.name,
          text: locale.fmt(locale.t('boss.autoDown', lang), { name: b.name, count: r.total }) });
        if (r.leveledUp) {
          state.appendEvent(id, { t: Date.now(), kind: 'level_up',
            text: locale.fmt(locale.t('boss.levelup', lang), { level: r.level, title: locale.t(r.titleKey, lang) }) });
        }
        for (const bid of r.newBadges) {
          state.appendEvent(id, { t: Date.now(), kind: 'badge_unlocked', badge: bid,
            text: locale.fmt(locale.t('badge.unlocked', lang), { name: locale.t(require('../core/progression').nameKeyFor(bid) || bid, lang) }) });
        }
        delete snap.boss;
        delete snap.todos;
      } else {
        boss.save(p.cwd, b);
      }
    }

    state.appendEvent(id, { t: Date.now(), kind: 'turn_end', text: card });
    state.ensureDirs();
    require('../core/safe-io').safeAppend(state.reportPath(id), card + '\n\n');

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
