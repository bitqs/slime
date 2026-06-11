#!/usr/bin/env node
const path = require('node:path');
const state = require('../core/state');
const hud = require('../core/hud');
const usage = require('../core/usage');
const locale = require('../core/locale');
const arenaStatus = require('../core/arena-status');
try {
  const stdin = state.readStdin() || {};
  usage.cacheFromStatusline(stdin);          // relay official fields to hooks
  // Opt-in: keep the arena server alive so the [HUD] link stays clickable.
  try {
    const cfg = /** @type {Record<string, unknown>} */ (require('../core/safe-io').readJson(path.join(state.ROOT, 'config.json'), {}) || {});
    if (cfg.autoArena) require('../core/arena-launch').ensureArena();
  } catch {}
  const id = stdin.session_id;
  const snap = id ? state.readSnapshot(id) : null;
  const lang = locale.current();
  const { readJson } = require('../core/safe-io');
  /** @type {string[]} */
  let tips = [];
  const fallbackTips = path.join(__dirname, '..', 'data', 'tips.json');
  if (lang !== 'en') {
    tips = readJson(path.join(__dirname, '..', 'data', `tips.${lang}.json`), null)
        || readJson(fallbackTips, []);
  } else {
    tips = readJson(fallbackTips, []);
  }
  if (!Array.isArray(tips)) tips = [];
  const prof = state.readProfile();
  const nq = require('../core/progression').nearestQuest(prof);
  const quest = nq ? `${nq.progress}/${nq.target}` : undefined;
  const streakDays = (prof.streak && prof.streak.days) || 0;
  process.stdout.write(hud.render(snap, stdin, tips, Date.now(), usage.readCache(), lang,
    arenaStatus.readLive(), prof.level, quest, streakDays, prof.prestige || 0,
    require('../core/eggs').total(prof)));
} catch {
  process.stdout.write('🟢 Slime');
}
process.exit(0);
