#!/usr/bin/env node
/** @typedef {import('../core/types').HookPayload} HookPayload */
/** @typedef {import('../core/types').Snapshot} Snapshot */
const state = require('../core/state');
const boss = require('../core/boss');
const locale = require('../core/locale');
const { runHook } = require('../core/hook-runner');

runHook((/** @type {HookPayload} */ p) => {
  if (p && p.session_id) {
    try { locale.tally(p.prompt); } catch {}
    const id = p.session_id;
    const snap = state.readSnapshot(id) || { sessionId: id, turn: 0, combo: 0, kills: 0, dmg: 0, summons: 0 };
    snap.turn = (snap.turn || 0) + 1;
    snap.inTurn = true;
    const lang = locale.current();
    const b = boss.loadOrCreate(p.cwd || '', p.prompt || '', lang);
    const estimate = require('../core/estimate');
    const est = estimate.estimateTokens(p.prompt || '');
    // Re-price the fight budget on every prompt: damped, grow-only, [40,400].
    // A fight that genuinely grows in scope toughens the boss (HP ticks up);
    // a broken boss awaiting confirmation can't be saved by a verbose prompt.
    if (!b.broken) {
      const prior = b.estLines;
      b.estLines = estimate.repriceLines(prior, estimate.estLines(est));
      if (prior && b.estLines > prior) {
        b.hp = Math.max(0, Math.round(100 * (1 - (b.dmgTaken || 0) / b.estLines)));
      }
    }
    // seal the chest tier the moment the boss exists (ATOM-L02: rolled at
    // spawn, revealed on defeat — stalling can't reroll it)
    if (!b.chestTier) {
      try {
        const chest = require('../core/chest');
        const eggs = require('../core/eggs');
        const prof = state.readProfile();
        chest.ensureTier(b, prof.chestCount || 0, eggs.lootBonus(prof));
      } catch {}
    }
    boss.save(p.cwd || '', b);
    try {
      const cfgPath = require('node:path').join(state.ROOT, 'config.json');
      const cfg = /** @type {{ haikuNaming?: unknown }} */ (require('../core/safe-io').readJson(cfgPath, {}) || {});
      if (cfg.haikuNaming && b.hp === 100 && !b.named) {
        b.named = true; boss.save(p.cwd || '', b);
        const { spawn } = require('node:child_process');
        spawn(process.execPath, [require('node:path').join(__dirname, 'namer.js'), p.cwd || '', p.prompt || ''],
          { detached: true, stdio: 'ignore' }).unref();
      }
    } catch {}
    snap.boss = { name: b.name, hp: b.hp };
    snap.est = est; // survives arena refreshes — encounter SSE events do not
    snap.cwd = p.cwd || ''; // picker label; snapshots are per-session so this is stable
    state.appendEvent(id, { t: Date.now(), kind: 'encounter', bossName: b.name, text: locale.fmt(locale.t('encounter', lang), { turn: snap.turn, name: b.name, hp: b.hp }), est });
    snap.lastText = locale.fmt(locale.t('encounter.appears', lang), { name: b.name });
    snap.updated = Date.now();
    state.writeSnapshot(id, snap);
  }
});
