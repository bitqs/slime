#!/usr/bin/env node
/** @typedef {import('../core/types').HookPayload} HookPayload */
/** @typedef {import('../core/types').Snapshot} Snapshot */
const state = require('../core/state');
const boss = require('../core/boss');
const locale = require('../core/locale');
try {
  /** @type {HookPayload | null} */
  const p = /** @type {HookPayload | null} */ (state.readStdin());
  if (p && p.session_id) {
    try { locale.tally(p.prompt); } catch {}
    const id = p.session_id;
    const snap = state.readSnapshot(id) || { sessionId: id, turn: 0, combo: 0, kills: 0, dmg: 0, summons: 0 };
    snap.turn = (snap.turn || 0) + 1;
    snap.inTurn = true;
    const lang = locale.current();
    const b = boss.loadOrCreate(p.cwd || '', p.prompt || '', lang);
    const est = require('../core/estimate').estimateTokens(p.prompt || '');
    if (!b.estLines) b.estLines = require('../core/estimate').estLines(est);
    boss.save(p.cwd || '', b);
    try {
      const cfgPath = require('node:path').join(state.ROOT, 'config.json');
      const cfg = /** @type {{ haikuNaming?: unknown }} */ (require('../core/safe-io').readJson(cfgPath, {}) || {});
      if (cfg.haikuNaming && b.hp === 100 && !b.named) {
        b.named = true; boss.save(p.cwd || '', b);
        const { spawn } = require('node:child_process');
        spawn('node', [require('node:path').join(__dirname, 'namer.js'), p.cwd || '', p.prompt || ''],
          { detached: true, stdio: 'ignore' }).unref();
      }
    } catch {}
    snap.boss = { name: b.name, hp: b.hp };
    snap.est = est; // survives arena refreshes — encounter SSE events do not
    state.appendEvent(id, { t: Date.now(), kind: 'encounter', bossName: b.name, text: locale.fmt(locale.t('encounter', lang), { turn: snap.turn, name: b.name, hp: b.hp }), est });
    snap.lastText = locale.fmt(locale.t('encounter.appears', lang), { name: b.name });
    snap.updated = Date.now();
    state.writeSnapshot(id, snap);
  }
} catch {}
process.exit(0);
