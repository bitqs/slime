'use strict';
/* Prestige / New Game+ — voluntarily reset level + XP for a permanent XP
   multiplier. Destructive to level/XP, so it's a two-step opt-in: a dry-run by
   default, and the actual reset only with --yes. Badges/streak/milestones kept. */
const state = require('../core/state');
const prog = require('../core/progression');

const prof = state.readProfile();
const lv = prog.levelFor(prof.xp || 0).level;
const tier = prof.prestige || 0;
const confirmed = process.argv.includes('--yes') || process.argv.includes('--confirm');
/** @param {number} p */
const mult = (p) => '×' + (1 + 0.25 * p).toFixed(2);

if (!prog.canPrestige(prof)) {
  process.stdout.write(
    `⟳ PRESTIGE — not yet\n` +
    `  You're Lv${lv}. Reach Lv${prog.PRESTIGE_MIN_LEVEL} to ascend.\n` +
    `  Prestige resets level/XP for a permanent +25% XP per tier — badges, streak & milestones are kept.\n`);
  process.exit(0);
}

if (!confirmed) {
  process.stdout.write(
    `⟳ PRESTIGE — ready\n` +
    `  Now: Lv${lv}, prestige ⟳${tier} (XP ${mult(tier)}).\n` +
    `  Ascending RESETS your level and XP to 0 and raises your permanent XP multiplier to ${mult(tier + 1)}.\n` +
    `  Kept: badges, streak, milestones. This cannot be undone.\n` +
    `  Confirm by re-running with --yes.\n`);
  process.exit(0);
}

const r = prog.prestige(prof);
if (r.ok && state.writeProfile(prof)) {
  process.stdout.write(
    `✦⟳ ASCENDED — prestige ⟳${r.prestige}!\n` +
    `  Level reset to 1. Permanent XP multiplier is now ${mult(r.prestige)}.\n` +
    `  Onward — earn it all back, faster.\n`);
  // announce to the live session so the arena plays the ascension ceremony
  try {
    const sid = state.newestSessionId();
    if (sid) {
      const locale = require('../core/locale');
      const lang = locale.current();
      state.appendEvent(sid, { t: Date.now(), kind: 'prestige', tier: r.prestige,
        text: locale.fmt(locale.t('prestige.ascend', lang), { tier: r.prestige, mult: mult(r.prestige) }) });
    }
  } catch {} // display-only — never fail the prestige over it
} else {
  process.stdout.write(`⟳ Prestige did not save — no changes made.\n`);
}
process.exit(0);
