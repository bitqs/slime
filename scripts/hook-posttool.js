#!/usr/bin/env node
const state = require('./lib/state');
const mapper = require('./lib/mapper');
const locale = require('./lib/locale');
const boss = require('./lib/boss');
try {
  const p = state.readStdin();
  if (p && p.session_id) {
    const id = p.session_id;
    const snap = state.readSnapshot(id) || { sessionId: id, turn: 0, combo: 0, kills: 0, dmg: 0, summons: 0 };
    const ev = mapper.resolve(p, snap, locale.current());
    state.appendEvent(id, ev);
    snap.combo = ev.combo ?? snap.combo;
    if (ev.dmg) snap.dmg = (snap.dmg || 0) + ev.dmg;
    if (ev.kill) snap.kills = (snap.kills || 0) + 1;
    if (ev.text) snap.lastText = ev.text;
    if ((p.tool_name || '') === 'TodoWrite' && p.tool_input && p.tool_input.todos && p.cwd) {
      const b = boss.loadOrCreate(p.cwd, '');
      b.hp = boss.hpFromTodos(p.tool_input.todos);
      boss.save(p.cwd, b);
      snap.boss = { name: b.name, hp: b.hp };
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
