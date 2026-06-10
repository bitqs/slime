/** @typedef {import('./types').BossState} BossState */
const fs = require('node:fs');
const path = require('node:path');
const state = require('./state');
const { hash } = require('./mapper');
const { safeWrite, readJson } = require('./safe-io');

/** @type {Array<[RegExp, string]>} */
const TYPES = [
  [/fix|bug|error|crash|broken|修复|修bug|崩溃/i, 'Bugbear'],
  [/refactor|rewrite|migrate|clean|重构|重写|迁移/i, 'Colossus'],
  [/add|build|implement|create|feature|make|添加|新增|实现|创建|做一个/i, 'Hydra'],
  [/test|coverage|测试|覆盖率/i, 'Wraith'],
  [/doc|readme|comment|文档|注释/i, 'Sphinx'],
];

/** @type {Record<string, string>} */
const TYPES_EN = {
  Bugbear: 'Glitch Slime',
  Colossus: 'Forge Slime',
  Hydra: 'Hydra Slime',
  Wraith: 'Trial Slime',
  Sphinx: 'Scroll Slime',
  Golem: 'Rock Slime',
};

/** @type {Record<string, string>} */
const TYPES_ZH = {
  Bugbear: '错虫史莱姆',
  Colossus: '重构史莱姆',
  Hydra: '九头史莱姆',
  Wraith: '试炼史莱姆',
  Sphinx: '文档史莱姆',
  Golem: '岩石史莱姆',
};

/** @type {Record<string, string[]>} */
const EPITHETS = {
  Bugbear: ['Rabid', 'Festering', 'Creeping', 'Glitched', 'Howling', 'Venomous', 'Spiteful', 'Crashing'],
  Colossus: ['Ancient', 'Crumbling', 'Towering', 'Rusted', 'Mossbound', 'Forgotten', 'Granite', 'Iron'],
  Hydra: ['Twin-headed', 'Sprouting', 'Ravenous', 'Coiling', 'Emerald', 'Spawning', 'Restless', 'Wild'],
  Wraith: ['Silent', 'Hollow', 'Veiled', 'Moaning', 'Pale', 'Drifting', 'Grim', 'Sleepless'],
  Sphinx: ['Riddling', 'Dusty', 'All-knowing', 'Inkstained', 'Whispering', 'Cryptic', 'Patient', 'Sealed'],
  Golem: ['Nameless', 'Lumbering', 'Mudborn', 'Stitched', 'Waking', 'Blank', 'Heavy', 'Stoneheart'],
};
/** @type {Record<string, string[]>} */
const EPITHETS_ZH = {
  Bugbear: ['狂暴', '溃烂', '潜伏', '错乱', '咆哮', '剧毒', '怨怒', '崩坏'],
  Colossus: ['远古', '崩裂', '擎天', '锈蚀', '苔缚', '遗忘', '花岗', '钢铁'],
  Hydra: ['双首', '增殖', '贪噬', '盘绕', '翠鳞', '滋生', '不眠', '狂野'],
  Wraith: ['无声', '空洞', '蒙面', '哀嚎', '苍白', '游荡', '冷峻', '失眠'],
  Sphinx: ['谜语', '积尘', '全知', '墨染', '低语', '晦涩', '静候', '封印'],
  Golem: ['无名', '蹒跚', '泥生', '缝合', '初醒', '空白', '沉重', '石心'],
};

/** @param {string} s @returns {string} */
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

/** Compress a cwd into a short display base: multi-word dirs → initials
 *  (digits kept), short single words keep their capitalized form, long
 *  single words truncate to 8.
 *  @param {string | null | undefined} cwd @returns {string} */
function compressName(cwd) {
  const raw = (cwd || 'unknown').split(/[\\/]/).filter(Boolean).pop() || 'unknown';
  const words = raw.split(/[-_\s]+/).filter(Boolean);
  if (words.length >= 2) return words.map((w) => w[0].toUpperCase()).join('');
  const w = cap(words[0] || 'unknown');
  return w.length <= 10 ? w : w.slice(0, 8);
}

/** @param {string | null | undefined} prompt @param {string | null | undefined} cwd @param {string} [lang] @returns {string} */
function nameBoss(prompt, cwd, lang) {
  const found = TYPES.find(([re]) => re.test(prompt || ''));
  const type = found ? found[1] : 'Golem';
  const base = compressName(cwd);
  const h = hash(prompt || '');
  if (lang === 'zh') {
    const adj = EPITHETS_ZH[type][h % EPITHETS_ZH[type].length];
    return `「${adj}・${base}」${TYPES_ZH[type]}`;
  }
  const ep = EPITHETS[type][h % EPITHETS[type].length];
  return `The ${ep} ${base} ${TYPES_EN[type]}`;
}

/** @param {string} cwd @returns {string} */
function bossPath(cwd) {
  return path.join(state.ROOT, 'bosses', `${hash(cwd)}.json`);
}

/** @param {string} cwd @param {string | null | undefined} prompt @param {string} [lang] @returns {BossState} */
function loadOrCreate(cwd, prompt, lang) {
  const l = lang || require('./locale').current(); // lazy require avoids cycles
  return readJson(bossPath(cwd), null)
    || { name: nameBoss(prompt, cwd, l), hp: 100, turns: 0, created: Date.now() };
}

/** @param {string} cwd @param {BossState} b @returns {void} */
function save(cwd, b) {
  state.ensureDirs();
  safeWrite(bossPath(cwd), JSON.stringify(b));
}

/** @param {string} cwd @returns {void} */
function clear(cwd) {
  try { fs.unlinkSync(bossPath(cwd)); } catch {}
}

/** @param {string} cwd @param {number} idx @param {string} [lang] @returns {string} */
function minionLabel(cwd, idx, lang) {
  const base = compressName(cwd);
  return lang === 'zh' ? `${base}·小兵 ${idx + 1}` : `${base} mob ${idx + 1}`;
}

/** Push a milestone, award XP (kill + badge + quest), recompute level once all
 *  XP has landed, unlock any newly-earned badges, and clear the boss file.
 *  @param {string} cwd @param {BossState} b
 *  @param {{ dmg?: number; kills?: number; maxCombo?: number }} [stats]
 *  @returns {{ total: number, level: number, leveledUp: boolean, titleKey: string, newBadges: string[], newQuests: string[], xpGained: number }} */
function recordDefeat(cwd, b, stats = {}) {
  const prof = state.readProfile();
  const m = {
    boss: b.name, date: new Date().toISOString().slice(0, 10),
    turns: b.turns || 0, project: cwd,
    at: Date.now(),
    dmg: typeof stats.dmg === 'number' ? stats.dmg : (b.dmgTaken || 0),
    kills: stats.kills || 0,
    maxCombo: stats.maxCombo || 0,
  };
  prof.milestones.push(m);
  const prog = require('./progression');
  const xpBefore = prof.xp || 0;
  const fromLevel = prog.levelFor(xpBefore).level;
  prof.xp = xpBefore + Math.round(prog.xpForDefeat(m) * prog.prestigeMult(prof));
  // badges: evaluate against the now-updated profile, persist new ones (+XP each)
  prof.badges = prof.badges || [];
  const newBadges = prog.evaluateBadges(prof);
  const now = Date.now();
  for (const id of newBadges) prof.badges.push({ id, unlockedAt: now });
  if (newBadges.length) prof.xp += Math.round(prog.BADGE_XP * newBadges.length * prog.prestigeMult(prof));
  // quests: a fresh kill can complete weekly_kills (idempotent; streak handled
  // per-turn). evaluateQuests pays quest XP into prof.xp itself.
  const { completed: newQuests } = prog.evaluateQuests(prof, now);
  // level: computed once, after kill + badge + quest XP have all landed
  const lv = prog.levelFor(prof.xp);
  prof.level = lv.level;
  state.writeProfile(prof);
  clear(cwd);
  return { total: prof.milestones.length, level: lv.level, leveledUp: lv.level > fromLevel, titleKey: lv.titleKey, newBadges, newQuests, xpGained: prof.xp - xpBefore };
}

module.exports = { nameBoss, loadOrCreate, save, clear, bossPath, compressName, minionLabel, recordDefeat };
