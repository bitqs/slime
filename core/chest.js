'use strict';
// chest — boss-kill lottery. The tier is SEALED when the boss spawns and only
// revealed on defeat (ATOM-L02/L03: the player can't reroll by stalling, and
// the reveal stays a surprise). Pure + deterministic, never throws.
const { hash } = require('./mapper');

/** @typedef {import('./types').BossState} BossState */
/** @typedef {{ id: string, weight: number, xp: number, nameKey: string, fx: string }} Reward */
/** @typedef {'silver' | 'gold' | 'jackpot'} Tier */

/** Newbie-luck script (ATOM-L01): taste gold early, hit the jackpot once,
 *  then fall back to honest odds. Indexed by lifetime chestCount. */
const NEWBIE_SEQ = /** @type {Tier[]} */ (['silver', 'silver', 'gold', 'silver', 'silver', 'jackpot']);

// three-die downgrade (ATOM-L03): roll jackpot, then gold; silver is the floor
const JACKPOT_CHANCE = 0.05;
const GOLD_CHANCE = 0.20;

/** Reward-id weights per tier — higher tiers shift toward bigger trinkets. */
const TIER_WEIGHTS = /** @type {Record<Tier, Record<string, number>>} */ ({
  silver:  { xp_small: 6, xp_medium: 3, xp_big: 1 },
  gold:    { xp_small: 2, xp_medium: 5, xp_big: 3 },
  jackpot: { xp_small: 0, xp_medium: 3, xp_big: 7 },
});

/** Chance the chest also carries a slime egg; the jackpot always does. */
const EGG_CHANCE = /** @type {Record<Tier, number>} */ ({ silver: 0.10, gold: 0.30, jackpot: 1 });

/** @param {string} seed @param {number} chestCount lifetime opened @param {number} [bonus] luck @returns {Tier} */
function rollTier(seed, chestCount, bonus = 0) {
  if (chestCount >= 0 && chestCount < NEWBIE_SEQ.length) return NEWBIE_SEQ[chestCount];
  /** @param {string} salt @param {number} chance @returns {boolean} */
  const gate = (salt, chance) =>
    (hash(salt + String(seed)) % 10000) < Math.round(Math.min(1, Math.max(0, chance + bonus)) * 10000);
  if (gate('tier-j:', JACKPOT_CHANCE)) return 'jackpot';
  if (gate('tier-g:', GOLD_CHANCE)) return 'gold';
  return 'silver';
}

/** Stamp a sealed tier on a boss (no-op when already present). Mutates + returns it.
 *  @param {BossState} b @param {number} chestCount @param {number} [bonus] @returns {Tier} */
function ensureTier(b, chestCount, bonus = 0) {
  if (!b.chestTier) b.chestTier = rollTier(String(b.name) + ':' + (b.created || 0), chestCount, bonus);
  return b.chestTier;
}

/** Open a chest: weighted reward pick + egg side-roll.
 *  @param {string} seed @param {Tier | string} tier @param {Reward[]} rewards @param {number} [bonus]
 *  @returns {{ tier: string, reward: Reward | null, egg: boolean }} */
function open(seed, tier, rewards, bonus = 0) {
  const t = /** @type {Tier} */ (TIER_WEIGHTS[/** @type {Tier} */ (tier)] ? tier : 'silver');
  const w = TIER_WEIGHTS[t];
  const pool = (Array.isArray(rewards) ? rewards : []).filter((r) => (w[r.id] || 0) > 0);
  const totalW = pool.reduce((s, r) => s + w[r.id], 0);
  /** @type {Reward | null} */
  let reward = null;
  if (totalW > 0) {
    let pick = hash('chest-pick:' + String(seed)) % totalW;
    for (const r of pool) {
      if (pick < w[r.id]) { reward = r; break; }
      pick -= w[r.id];
    }
  }
  const eggChance = Math.min(1, Math.max(0, EGG_CHANCE[t] + bonus));
  const egg = (hash('chest-egg:' + String(seed)) % 10000) < Math.round(eggChance * 10000);
  return { tier: t, reward, egg };
}

module.exports = { NEWBIE_SEQ, TIER_WEIGHTS, EGG_CHANCE, JACKPOT_CHANCE, GOLD_CHANCE, rollTier, ensureTier, open };
