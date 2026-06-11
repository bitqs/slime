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
const defeatFlow = require('../core/defeat-flow');
const progression = require('../core/progression');
const { runHook } = require('../core/hook-runner');

runHook((/** @type {HookPayload} */ p) => {
  if (p && p.session_id) {
    const id = p.session_id;
    /** @type {Snapshot} */
    const snap = state.readSnapshot(id) || /** @type {Snapshot} */ ({ sessionId: id, turn: 1, combo: 0, kills: 0, dmg: 0, summons: 0 });
    const events = state.readEvents(id);
    const agg = report.aggregate(events);
    const fs = require('node:fs');
    const b = p.cwd && fs.existsSync(boss.bossPath(p.cwd)) ? boss.loadOrCreate(p.cwd, '') : null;
    const u = usage.readCache();
    const lang = locale.current();
    const sageLine = sage.advise({ usage: u, bossHp: b ? b.hp : null, lang });
    // boss name is user-prompt- or LLM-derived — sanitize before terminal display
    const { sanitize } = require('../core/hud');
    /** @param {string} key @param {Record<string, unknown>} [vars] @returns {string} */
    const T = (key, vars) => locale.fmt(locale.t(key, lang), vars);

    // ── defeat first, so the turn report can carry the kill + rewards ────────
    /** @type {string[]} */
    let defeatQuests = [];
    /** @type {string | null} */
    let defeatLastText = null;
    let defeated = false;
    if (b && p.cwd) {
      b.turns = snap.turn || 0;
      if (b.broken) {
        // all todos done and still broken at stop → confirmed kill, no typing needed.
        // Whole-fight totals win over the current-turn agg (multi-turn fights).
        const r = boss.recordDefeat(p.cwd, b, {
          dmg: Math.max(agg.dmg, b.fightDmg || 0),
          kills: Math.max(agg.kills, b.fightKills || 0),
          maxCombo: Math.max(agg.maxCombo, b.fightMaxCombo || 0),
        });
        defeated = true;
        defeatQuests = r.newQuests || [];
        const downText = T('boss.autoDown', { name: b.name, count: r.total });
        state.appendEvent(id, { t: Date.now(), kind: 'boss_down', boss: b.name, xp: r.xpGained, text: downText });
        defeatFlow.emitRewards(id, r, lang);
        defeatLastText = [downText, ...defeatFlow.rewardLines(r, lang)].join(' · ');
        delete snap.boss;
        delete snap.todos;
      } else {
        boss.save(p.cwd, b);
      }
    }

    // ── per-turn activity tick: daily streak + quest progress (quest XP can
    // tip a level even without a kill — recompute and announce) ──────────────
    const prof = state.readProfile();
    prof.totals.turns += 1;
    prof.totals.dmg += agg.dmg;
    prof.totals.kills += agg.kills;
    const tickNow = Date.now();
    progression.bumpActivity(prof, tickNow);
    const lvBefore = progression.levelFor(prof.xp || 0).level;
    const { completed: doneQuests, xpGained: questXp } = progression.evaluateQuests(prof, tickNow);
    const lvAfter = progression.levelFor(prof.xp || 0);
    prof.level = lvAfter.level;
    state.writeProfile(prof);
    defeatFlow.emitQuests(id, doneQuests.filter((q) => !defeatQuests.includes(q)), lang);
    if (questXp && lvAfter.level > lvBefore) {
      state.appendEvent(id, { t: Date.now(), kind: 'level_up',
        text: defeatFlow.levelupText({ level: lvAfter.level, titleKey: lvAfter.titleKey }, lang) });
    }

    // ── turn report: stats card + every reward this turn earned (kill XP,
    // level, badges, quests — whether it landed mid-turn or just now) ────────
    const evs = state.readEvents(id);
    const turnEvs = evs.slice(evs.map((e) => e.kind).lastIndexOf('turn_end') + 1);
    /** @type {string[]} */
    const rewardLines = [];
    for (const e of turnEvs) {
      if (e.kind === 'boss_down') {
        rewardLines.push(sanitize(e.text, 200));
        if (typeof e.xp === 'number' && e.xp > 0) rewardLines.push(T('report.xp', { xp: e.xp }));
      } else if (e.kind === 'level_up' || e.kind === 'badge_unlocked' || e.kind === 'quest_done'
              || e.kind === 'chest_open' || e.kind === 'egg_drop') {
        rewardLines.push(sanitize(e.text, 200));
      }
    }
    const statsCard = report.render(agg, !defeated && b ? { name: sanitize(b.name), hp: b.hp } : null, snap,
      { usage: u, sageLine: sageLine ?? undefined, lang });
    const card = rewardLines.length ? statsCard + '\n' + rewardLines.join('\n') : statsCard;

    state.appendEvent(id, { t: Date.now(), kind: 'turn_end', text: card });
    state.ensureDirs();
    require('../core/safe-io').safeAppend(state.reportPath(id), card + '\n\n');

    snap.inTurn = false;
    snap.combo = 0;
    // a kill is bigger news than "turn complete" — keep it on the statusline
    snap.lastText = defeatLastText || T('turn.complete', { turn: snap.turn, rank: report.rank(agg) });
    snap.updated = Date.now();
    state.writeSnapshot(id, snap);

    // the only user-visible hook output: the turn report (display only)
    process.stdout.write(JSON.stringify({ systemMessage: card }));
  }
});
