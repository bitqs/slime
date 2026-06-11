'use strict';
// loot — deterministic random-reward roll. Pure: same (seed, table) → same result.
// Seeded from mapper.hash so the hot path stays Math.random()-free and replay-stable.
const { hash } = require('./mapper');

/** @typedef {{ id: string, weight: number, xp: number, nameKey: string, fx: string }} Reward */
/** @typedef {{ chance: number, rewards: Reward[] }} LootTable */

/** Default table — the declarative add-a-reward seam (data/loot.json). */
const TABLE = /** @type {LootTable} */ (require('../data/loot.json'));

/**
 * Decide a loot drop. Returns the chosen reward or null (no drop / malformed
 * table). Never throws — the caller is the fail-soft PostToolUse hook.
 * @param {string} seed any per-roll string; same seed → same outcome
 * @param {LootTable} [table]
 * @param {number} [bonus] additive luck (loot-egg cross-cut, ATOM-L04)
 * @returns {Reward | null}
 */
function roll(seed, table = TABLE, bonus = 0) {
  if (!table || !Array.isArray(table.rewards) || table.rewards.length === 0) return null;
  // clamp to a valid probability so bad data (e.g. chance > 1) can't mean "always drop"
  const chance = Math.min(1, Math.max(0, (typeof table.chance === 'number' ? table.chance : 0) + bonus));
  if (chance <= 0) return null;
  // drop gate: uniform 0..9999 vs the integer threshold (chance 1 → threshold 10000, never gated out)
  if ((hash(String(seed)) % 10000) >= Math.round(chance * 10000)) return null;
  // weighted pick on a SALTED seed — prefixing diverges the hash from the first
  // character, so the reward choice doesn't track the drop-gate hash.
  const total = table.rewards.reduce((s, r) => s + (r.weight > 0 ? r.weight : 0), 0);
  if (total <= 0) return null;
  let pick = hash('pick:' + String(seed)) % total;
  for (const r of table.rewards) {
    const w = r.weight > 0 ? r.weight : 0;
    if (pick < w) return r;
    pick -= w;
  }
  // unreachable with integer weights (the loop covers [0,total)); null is a safety net
  return null;
}

module.exports = { roll, TABLE };
