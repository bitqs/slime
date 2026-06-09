#!/usr/bin/env node
/** @typedef {import('../core/types').HookPayload} HookPayload */
/** @typedef {import('../core/types').Snapshot} Snapshot */
const state = require('../core/state');
const mapper = require('../core/mapper');
const locale = require('../core/locale');
const { runHook } = require('../core/hook-runner');

runHook((/** @type {HookPayload} */ p) => {
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
    if (p.tool_name === 'AskUserQuestion' && p.tool_input && Array.isArray(p.tool_input.questions)) {
      const questions = p.tool_input.questions.slice(0, 4).map((q) => ({
        q: String(q.question || '').slice(0, 200),
        opts: (Array.isArray(q.options) ? q.options : []).slice(0, 5).map((o) => String((o && o.label) || '').slice(0, 60)),
      }));
      state.appendEvent(id, { t: Date.now(), kind: 'choice_open', questions });
    }
    if (p.tool_name === 'ExitPlanMode' && p.tool_input && p.tool_input.plan) {
      state.appendEvent(id, { t: Date.now(), kind: 'plan_scroll', plan: String(p.tool_input.plan).slice(0, 1500), est: require('../core/estimate').estimateTokens(p.tool_input.plan) });
    }
  }
});
