#!/usr/bin/env node
/** @typedef {import('../core/types').HookPayload} HookPayload */
const state = require('../core/state');
const mapper = require('../core/mapper');
const locale = require('../core/locale');
const boss = require('../core/boss');
const report = require('../core/report');
const defeatFlow = require('../core/defeat-flow');
const loot = require('../core/loot');
const eggs = require('../core/eggs');
const prog = require('../core/progression');
const { runHook } = require('../core/hook-runner');

runHook((/** @type {HookPayload} */ p) => {
  if (p && p.session_id) {
    const id = p.session_id;
    const snap = state.readSnapshot(id) || { sessionId: id, turn: 0, combo: 0, kills: 0, dmg: 0, summons: 0 };
    const ev = mapper.resolve(p, snap, locale.current());
    // anti-farm: a green test run pays one kill per distinct command per fight.
    // Re-running the same suite keeps the resolve but earns nothing; a different
    // command is a fresh kill. Signatures die with the boss file on defeat.
    if (ev.kill && p.cwd && (p.tool_name || '') === 'Bash') {
      const sig = mapper.hash(String((p.tool_input && (p.tool_input.command || p.tool_input.cmd)) || ''));
      const b = boss.loadOrCreate(p.cwd, '');
      const sigs = Array.isArray(b.testKillSigs) ? b.testKillSigs : [];
      if (sigs.includes(sig)) {
        ev.kill = false;
        ev.text = locale.t('resolve.alreadyClear', locale.current());
      } else {
        b.testKillSigs = sigs.concat(sig).slice(-20);
        boss.save(p.cwd, b);
      }
    }
    state.appendEvent(id, ev);
    snap.combo = ev.combo ?? snap.combo;
    if (ev.dmg) snap.dmg = (snap.dmg || 0) + ev.dmg;
    if (ev.kill) snap.kills = (snap.kills || 0) + 1;
    if (ev.text) snap.lastText = ev.text;
    if (ev.dmg && p.cwd) {
      const b = boss.loadOrCreate(p.cwd, '');
      if (!b.estLines) b.estLines = require('../core/estimate').estLines(null);
      // In-fight arc (ATOM-P14): HP damage rides the live combo — grind early,
      // surge once the streak builds; one miss resets it. The per-hit cap below
      // still guarantees ≥4 hits to kill. XP is unaffected — it reads raw dmg.
      const profForCaps = state.readProfile();
      const comboMult = prog.comboDmgMult(ev.combo || 0, eggs.comboCap(profForCaps));
      const hpHit = Math.min(Math.round(ev.dmg * comboMult), Math.ceil(b.estLines * 0.25));
      b.dmgTaken = (b.dmgTaken || 0) + hpHit;
      b.hp = Math.max(0, Math.round(100 * (1 - b.dmgTaken / b.estLines)));
      // whole-fight totals (uncapped, across turns) so a multi-turn kill pays
      // XP for the full fight — recordDefeat reads these over the turn agg
      b.fightDmg = (b.fightDmg || 0) + ev.dmg;
      if (ev.kill) b.fightKills = (b.fightKills || 0) + 1;
      if (ev.combo) b.fightMaxCombo = Math.max(b.fightMaxCombo || 0, ev.combo);
      if (b.hp === 0 && !b.broken) {
        b.broken = true;
        state.appendEvent(id, { t: Date.now(), kind: 'boss_broken', boss: b.name,
          text: locale.fmt(locale.t('boss.broken', locale.current()), { name: b.name }) });
      }
      boss.save(p.cwd, b);
      snap.boss = { name: b.name, hp: b.hp, broken: !!b.broken };
      // loot: a damaging resolve has a small, deterministic chance to drop bonus XP.
      // Seed = sessionId + a per-session counter (persisted on snap) → no Math.random
      // in the hot path. XP is applied once here; the loot_drop event is display-only,
      // so SSE replay never re-rolls or double-counts.
      const seed = id + ':' + (snap.resolves = (snap.resolves || 0) + 1);
      const drop = loot.roll(seed, undefined, eggs.lootBonus(profForCaps));
      if (drop) {
        const prof = state.readProfile();
        const fromLevel = prog.levelFor(prof.xp || 0).level;
        prof.xp = (prof.xp || 0) + Math.round(drop.xp * prog.prestigeMult(prof));
        const lv = prog.levelFor(prof.xp);
        prof.level = lv.level;
        // only announce the reward if the XP actually persisted — never show fake XP
        if (state.writeProfile(prof)) {
          const lang = locale.current();
          const lootText = locale.fmt(locale.t('loot.drop', lang), { xp: drop.xp, name: locale.t(drop.nameKey, lang) });
          state.appendEvent(id, { t: Date.now(), kind: 'loot_drop', loot: drop.id, xp: drop.xp, fx: drop.fx, text: lootText });
          snap.lastText = lootText;
          // a lucky drop can tip a level — celebrate it like any other level-up
          if (lv.level > fromLevel) {
            const lvText = defeatFlow.levelupText({ level: lv.level, titleKey: lv.titleKey }, lang);
            state.appendEvent(id, { t: Date.now(), kind: 'level_up', text: lvText });
            snap.lastText = lvText;
          }
        }
      }
    }
    // slime egg (ATOM-G07): a confirmed kill has a small, luck-adjusted chance
    // to drop a permanent micro-perk. Deterministic seed (snap.kills here is
    // the post-increment count for this kill); XP-free, so no level math needed.
    if (ev.kill) {
      const prof = state.readProfile();
      const perk = eggs.roll(id + ':egg:' + (snap.kills || 0), eggs.lootBonus(prof));
      if (perk) {
        eggs.grant(prof, perk.id);
        if (state.writeProfile(prof)) {
          const lang = locale.current();
          const text = locale.fmt(locale.t('egg.drop', lang),
            { perk: locale.t(perk.nameKey, lang), count: eggs.total(prof) });
          state.appendEvent(id, { t: Date.now(), kind: 'egg_drop', perk: perk.id, text });
          snap.lastText = text;
        }
      }
    }
    if ((p.tool_name || '') === 'TodoWrite' && p.tool_input && p.tool_input.todos && p.cwd) {
      const lang = locale.current();
      const hud = require('../core/hud');
      const { hash } = require('../core/mapper');
      const todos = p.tool_input.todos;
      const cwd = p.cwd;
      const b = boss.loadOrCreate(cwd, '');
      const allDone = todos.length > 0 && todos.every((t) => t.status === 'completed');
      if (allDone && b.hp > 0) {
        if ((b.fightDmg || 0) >= 0.25 * (b.estLines || 40)) {
          // every minion is down after a real fight (≥25% of the budget in
          // actual edits) — ULTIMATE finisher
          b.hp = 0;
          if (!b.broken) {
            b.broken = true;
            state.appendEvent(id, { t: Date.now(), kind: 'ultimate', boss: b.name,
              text: locale.fmt(locale.t('boss.ultimate', lang), { name: b.name }) });
            state.appendEvent(id, { t: Date.now(), kind: 'boss_broken', boss: b.name,
              text: locale.fmt(locale.t('boss.broken', lang), { name: b.name }) });
          }
        } else if (!b.broken) {
          // todos done but barely any real damage dealt (anti kill-mill): the
          // guard breaks, HP stays up — the kill confirms via real damage or
          // the Stop hook's natural path, never as an instant zero
          b.broken = true;
          state.appendEvent(id, { t: Date.now(), kind: 'boss_broken', boss: b.name,
            text: locale.fmt(locale.t('boss.broken', lang), { name: b.name }) });
        }
      } else if (!allDone && b.broken && (b.dmgTaken || 0) < (b.estLines || 1)) {
        // new live todos while not actually out of budget → revive from the budget
        b.broken = false;
        b.hp = Math.max(1, Math.round(100 * (1 - (b.dmgTaken || 0) / (b.estLines || 1))));
      }
      boss.save(cwd, b);
      snap.boss = { name: b.name, hp: b.hp, broken: !!b.broken };

      // minion rail snapshot + kill diff
      const list = todos.map((todo, i) => ({
        content: hud.sanitize(todo.content, 80),
        status: String(todo.status || 'pending'),
        label: boss.minionLabel(cwd, i, lang),
        activeForm: hud.sanitize(todo.activeForm, 60),
        form: hash(String(todo.content || '')), // full seed → intrinsic slime variety
      }));
      const prevDone = new Set((Array.isArray(snap.todos) ? snap.todos : [])
        .filter((t) => t.status === 'completed').map((t) => t.content));
      const fresh = list.filter((t) => t.status === 'completed' && !prevDone.has(t.content));
      if (fresh.length > 3) {
        state.appendEvent(id, { t: Date.now(), kind: 'minion_down',
          minion: fresh[0].label, count: fresh.length,
          text: locale.fmt(locale.t('minion.multi', lang), { count: fresh.length }) });
      } else {
        for (const k of fresh) {
          state.appendEvent(id, { t: Date.now(), kind: 'minion_down', minion: k.label,
            text: locale.fmt(locale.t('minion.down', lang), { minion: k.content }) });
        }
      }
      if (fresh.length) snap.lastText = locale.fmt(locale.t('minion.down', lang), { minion: fresh[fresh.length - 1].content });
      snap.todos = list;
    }
    // Auto-down: a finished boss (broken, HP 0) leaves the stage at once instead
    // of lingering until Stop. Both break paths (dmg-exhaustion and all-todos-done)
    // land here; the revive path above already un-broke any premature break, so a
    // still-broken HP-0 boss is a genuine finish. recordDefeat clears the boss file,
    // so the next tool call spawns a fresh boss.
    if (p.cwd && snap.boss && snap.boss.broken && snap.boss.hp === 0) {
      const fb = boss.loadOrCreate(p.cwd, '');
      if (fb.broken && fb.hp === 0) {
        const lang = locale.current();
        const agg = report.aggregate(state.readEvents(id));
        // whole-fight totals win over the current-turn agg (multi-turn fights)
        const r = boss.recordDefeat(p.cwd, fb, {
          dmg: Math.max(agg.dmg, fb.fightDmg || 0),
          kills: Math.max(agg.kills, fb.fightKills || 0),
          maxCombo: Math.max(agg.maxCombo, fb.fightMaxCombo || 0),
        });
        const downText = locale.fmt(locale.t('boss.autoDown', lang), { name: fb.name, count: r.total });
        state.appendEvent(id, { t: Date.now(), kind: 'boss_down', boss: fb.name, xp: r.xpGained, text: downText });
        defeatFlow.emitRewards(id, r, lang);
        // the kill is the headline — put it (plus any level/badge/quest news) on
        // the statusline instead of leaving the last tool's resolve text up
        snap.lastText = [downText, ...defeatFlow.rewardLines(r, lang)].join(' · ');
        delete snap.boss;
        delete snap.todos;
      }
    }
    snap.updated = Date.now();
    state.writeSnapshot(id, snap);
    if (p.tool_name === 'AskUserQuestion') {
      const ans = (p.tool_response && p.tool_response.answers) || {};
      const chosen = Object.values(ans).filter((v) => typeof v === 'string').map((v) => v.slice(0, 60));
      state.appendEvent(id, { t: Date.now(), kind: 'choice_made', chosen });
    }
    if (p.tool_name === 'ExitPlanMode') {
      state.appendEvent(id, { t: Date.now(), kind: 'plan_approved' });
    }
  }
});
