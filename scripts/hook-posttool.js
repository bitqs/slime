#!/usr/bin/env node
/** @typedef {import('../core/types').HookPayload} HookPayload */
const state = require('../core/state');
const mapper = require('../core/mapper');
const locale = require('../core/locale');
const boss = require('../core/boss');
try {
  /** @type {HookPayload | null} */
  const p = /** @type {HookPayload | null} */ (state.readStdin());
  if (p && p.session_id) {
    const id = p.session_id;
    const snap = state.readSnapshot(id) || { sessionId: id, turn: 0, combo: 0, kills: 0, dmg: 0, summons: 0 };
    const ev = mapper.resolve(p, snap, locale.current());
    state.appendEvent(id, ev);
    snap.combo = ev.combo ?? snap.combo;
    if (ev.dmg) snap.dmg = (snap.dmg || 0) + ev.dmg;
    if (ev.kill) snap.kills = (snap.kills || 0) + 1;
    if (ev.text) snap.lastText = ev.text;
    if (ev.dmg && p.cwd) {
      const b = boss.loadOrCreate(p.cwd, '');
      b.dmgTaken = (b.dmgTaken || 0) + ev.dmg;
      if (!b.estLines) b.estLines = require('../core/estimate').estLines(null);
      b.hp = Math.max(0, Math.round(100 * (1 - b.dmgTaken / b.estLines)));
      if (b.hp === 0 && !b.broken) {
        b.broken = true;
        state.appendEvent(id, { t: Date.now(), kind: 'boss_broken', boss: b.name,
          text: locale.fmt(locale.t('boss.broken', locale.current()), { name: b.name }) });
      }
      boss.save(p.cwd, b);
      snap.boss = { name: b.name, hp: b.hp, broken: !!b.broken };
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
        // every minion is down but the boss still stands — ULTIMATE finisher
        b.hp = 0;
        if (!b.broken) {
          b.broken = true;
          state.appendEvent(id, { t: Date.now(), kind: 'ultimate', boss: b.name,
            text: locale.fmt(locale.t('boss.ultimate', lang), { name: b.name }) });
          state.appendEvent(id, { t: Date.now(), kind: 'boss_broken', boss: b.name,
            text: locale.fmt(locale.t('boss.broken', lang), { name: b.name }) });
        }
      } else if (!allDone && b.broken && b.hp === 0 && (b.dmgTaken || 0) < (b.estLines || 1)) {
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
} catch {}
process.exit(0);
