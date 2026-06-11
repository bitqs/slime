'use strict';
// eggs — the infinite micro-growth layer (VS golden-egg analog, ATOM-G07).
// Each egg permanently bumps one tiny stat; a hundred eggs make a god.
// Pure + deterministic (mapper.hash-seeded) and prestige never clears them.
const { hash } = require('./mapper');

/** @typedef {import('./types').Profile} Profile */

/** Drop chance per confirmed kill (loot-egg bonus cross-cuts it). */
const EGG_CHANCE = 0.03;

/** Perk pool — weighted pick, one perk per egg. */
const PERKS = [
  { id: 'xp',    weight: 40, nameKey: 'egg.perk.xp' },    // +1% xp gain
  { id: 'loot',  weight: 30, nameKey: 'egg.perk.loot' },  // +0.2% drop chance
  { id: 'crit',  weight: 25, nameKey: 'egg.perk.crit' },  // +0.5% arena crit base
  { id: 'combo', weight: 5,  nameKey: 'egg.perk.combo' }, // +2% combo dmg cap (rare)
];

/** @param {Profile | null | undefined} profile @returns {{ xp: number, loot: number, crit: number, combo: number }} */
function counts(profile) {
  const e = (profile && profile.eggs) || {};
  return { xp: e.xp || 0, loot: e.loot || 0, crit: e.crit || 0, combo: e.combo || 0 };
}

/** @param {Profile | null | undefined} profile @returns {number} */
function total(profile) {
  const c = counts(profile);
  return c.xp + c.loot + c.crit + c.combo;
}

/** Multiplier on xp gains from xp-eggs. @param {Profile | null | undefined} profile @returns {number} */
function xpMult(profile) { return 1 + 0.01 * counts(profile).xp; }
/** Additive drop-chance bonus — cross-cuts loot, egg and chest rolls (ATOM-L04).
 *  @param {Profile | null | undefined} profile @returns {number} */
function lootBonus(profile) { return 0.002 * counts(profile).loot; }
/** Additive arena crit-base bonus (cosmetic; consumed by public/moves.js).
 *  @param {Profile | null | undefined} profile @returns {number} */
function critBonus(profile) { return 0.005 * counts(profile).crit; }
/** Combo damage multiplier ceiling: base ×2, each combo-egg widens it, hard cap ×3.
 *  @param {Profile | null | undefined} profile @returns {number} */
function comboCap(profile) { return Math.min(3, 2 * (1 + 0.02 * counts(profile).combo)); }

/** Weighted perk pick on a salted seed. @param {string} seed @returns {(typeof PERKS)[number]} */
function pickPerk(seed) {
  const totalW = PERKS.reduce((s, p) => s + p.weight, 0);
  let pick = hash('egg-pick:' + String(seed)) % totalW;
  for (const p of PERKS) {
    if (pick < p.weight) return p;
    pick -= p.weight;
  }
  return PERKS[0]; // unreachable with integer weights; safety net
}

/** Roll an egg drop. @param {string} seed @param {number} [bonus] @returns {(typeof PERKS)[number] | null} */
function roll(seed, bonus = 0) {
  const chance = Math.min(1, Math.max(0, EGG_CHANCE + bonus));
  if ((hash('egg:' + String(seed)) % 10000) >= Math.round(chance * 10000)) return null;
  return pickPerk(seed);
}

/** Apply one egg (mutates profile). @param {Profile} profile @param {string} perkId @returns {number} new count */
function grant(profile, perkId) {
  if (!PERKS.some((p) => p.id === perkId)) return 0; // unknown perk — never pollute the profile
  const e = profile.eggs || (profile.eggs = {});
  const k = /** @type {keyof typeof e} */ (perkId);
  e[k] = (e[k] || 0) + 1;
  return /** @type {number} */ (e[k]);
}

module.exports = { EGG_CHANCE, PERKS, counts, total, xpMult, lootBonus, critBonus, comboCap, pickPerk, roll, grant };
