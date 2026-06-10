// @ts-check
/** @typedef {{ en: string; zh: string }} MoveName */
/** @typedef {{ element: string; move: string; tier: 'normal'|'finisher'|'crit'; jitter: number; name: MoveName }} Pick */

// @ts-ignore — UMD wrapper: `self` is a valid browser global; tsc doesn't know it without DOM lib
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else /** @type {any} */ (root).SlimeMoves = factory();
// @ts-ignore
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Element per tool family. Anything unrecognized is arcane.
  /** @type {Array<[RegExp, string]>} */
  const ELEMENT_BY_TOOL = [
    [/^(Edit|Write|NotebookEdit)/, 'blade'],
    [/^Bash/, 'fire'],
    [/^(Grep|Glob)/, 'lightning'],
    [/^Read/, 'holy'],
    [/^Web(Fetch|Search)/, 'ice'],
  ];

  // 4 moves per element. `move` is the FX key the arena composes from.
  /** @type {Record<string, Array<{ move: string; name: MoveName }>>} */
  const MOVES = {
    blade: [
      { move: 'crescent_slash', name: { en: 'Crescent Slash', zh: '月牙斩' } },
      { move: 'twin_fang', name: { en: 'Twin Fang', zh: '双牙连斩' } },
      { move: 'riposte', name: { en: 'Riposte', zh: '回风刺' } },
      { move: 'heavens_edge', name: { en: "Heaven's Edge", zh: '天际刃' } },
    ],
    fire: [
      { move: 'fireball', name: { en: 'Fireball', zh: '火球术' } },
      { move: 'ember_wave', name: { en: 'Ember Wave', zh: '余烬波' } },
      { move: 'flame_lash', name: { en: 'Flame Lash', zh: '烈焰鞭' } },
      { move: 'meteor_jab', name: { en: 'Meteor Jab', zh: '流星突' } },
    ],
    lightning: [
      { move: 'chain_bolt', name: { en: 'Chain Bolt', zh: '连锁闪电' } },
      { move: 'static_lance', name: { en: 'Static Lance', zh: '静电枪' } },
      { move: 'storm_call', name: { en: 'Storm Call', zh: '唤雷' } },
      { move: 'volt_rush', name: { en: 'Volt Rush', zh: '伏特冲锋' } },
    ],
    holy: [
      { move: 'light_pillar', name: { en: 'Light Pillar', zh: '圣光柱' } },
      { move: 'radiant_scan', name: { en: 'Radiant Scan', zh: '辉光洞察' } },
      { move: 'blessed_strike', name: { en: 'Blessed Strike', zh: '祝福打击' } },
      { move: 'judgement', name: { en: 'Judgement', zh: '审判' } },
    ],
    ice: [
      { move: 'frost_shard', name: { en: 'Frost Shard', zh: '霜晶刺' } },
      { move: 'glacier_spike', name: { en: 'Glacier Spike', zh: '冰川锥' } },
      { move: 'hail_volley', name: { en: 'Hail Volley', zh: '冰雹齐射' } },
      { move: 'absolute_zero', name: { en: 'Absolute Zero', zh: '绝对零度' } },
    ],
    arcane: [
      { move: 'mana_burst', name: { en: 'Mana Burst', zh: '魔力爆发' } },
      { move: 'rune_dart', name: { en: 'Rune Dart', zh: '符文飞镖' } },
      { move: 'void_ripple', name: { en: 'Void Ripple', zh: '虚空涟漪' } },
      { move: 'astral_lance', name: { en: 'Astral Lance', zh: '星界枪' } },
    ],
  };

  // PRD crit pacing (Dota-style): start low, climb on every non-crit so dry
  // streaks self-correct; reset + 1-pick cooldown on crit so it never chains.
  // Constants tuned by simulation for ~5% effective rate (the nominal "5%
  // crit"): linear ramp means the effective rate runs well above the base.
  const CRIT_BASE = 0.002, CRIT_STEP = 0.004, CRIT_CAP = 0.35;

  /** @param {string} tool @returns {string} */
  function elementFor(tool) {
    const hit = ELEMENT_BY_TOOL.find(([re]) => re.test(tool || ''));
    return hit ? hit[1] : 'arcane';
  }

  /**
   * @param {(() => number) | undefined} [rng]
   * @returns {{ pick: (tool: string, combo: number) => Pick }}
   */
  function createPicker(rng) {
    const rand = rng || Math.random;
    /** @type {Record<string, Array<{ move: string; name: MoveName }>>} */
    const bags = {};
    /** @type {Record<string, string>} */
    const lastMove = {};
    let critChance = CRIT_BASE;
    let critCooldown = false;

    /** @param {string} el @returns {{ move: string; name: MoveName }} */
    function draw(el) {
      let bag = bags[el];
      if (!bag || !bag.length) {
        bag = bags[el] = MOVES[el].slice();
        // Fisher–Yates
        for (let i = bag.length - 1; i > 0; i--) {
          const j = Math.floor(rand() * (i + 1));
          const t = bag[i]; bag[i] = bag[j]; bag[j] = t;
        }
        // no immediate repeat across the refill boundary
        if (bag.length > 1 && bag[bag.length - 1].move === lastMove[el]) {
          const t = bag[bag.length - 1]; bag[bag.length - 1] = bag[0]; bag[0] = t;
        }
      }
      const m = /** @type {{ move: string; name: MoveName }} */ (bag.pop());
      lastMove[el] = m.move;
      return m;
    }

    /** @param {string} tool @param {number} combo @returns {Pick} */
    function pick(tool, combo) {
      const element = elementFor(tool);
      const m = draw(element);
      /** @type {Pick['tier']} */
      let tier = 'normal';
      if (!critCooldown && rand() < critChance) {
        tier = 'crit';
        critChance = CRIT_BASE;
        critCooldown = true;
      } else {
        critCooldown = false;
        critChance = Math.min(CRIT_CAP, critChance + CRIT_STEP);
        if (combo > 0 && combo % 3 === 0) tier = 'finisher';
      }
      return { element, move: m.move, tier, jitter: 0.8 + rand() * 0.4, name: m.name };
    }

    return { pick };
  }

  return { createPicker, elementFor, MOVES };
}));
