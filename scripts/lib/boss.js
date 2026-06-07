/** @typedef {import('./types').BossState} BossState */
/** @typedef {import('./types').TodoItem} TodoItem */
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
const TYPES_ZH = {
  Bugbear: '错虫王',
  Colossus: '重构巨像',
  Hydra: '九头蛇',
  Wraith: '试炼怨灵',
  Sphinx: '文档斯芬克斯',
  Golem: '魔像',
};

/** @param {string} s @returns {string} */
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

/** @param {string | null | undefined} prompt @param {string | null | undefined} cwd @param {string} [lang] @returns {string} */
function nameBoss(prompt, cwd, lang) {
  const found = TYPES.find(([re]) => re.test(prompt || ''));
  const type = found ? found[1] : 'Golem';
  const base = cap((cwd || 'unknown').split(/[\\/]/).filter(Boolean).pop() || 'unknown');
  if (lang === 'zh') {
    return `「${base}」${TYPES_ZH[type]}`;
  }
  return `The ${base} ${type}`;
}

/** @param {TodoItem[] | null | undefined} todos @returns {number} */
function hpFromTodos(todos) {
  if (!todos || !todos.length) return 100;
  const done = todos.filter((todo) => todo.status === 'completed').length;
  return Math.max(0, Math.round(100 * (1 - done / todos.length)));
}

/** @param {string} cwd @returns {string} */
function bossPath(cwd) {
  return path.join(state.ROOT, 'bosses', `${hash(cwd)}.json`);
}

/** @param {string} cwd @param {string | null | undefined} prompt @param {string} [lang] @returns {BossState} */
function loadOrCreate(cwd, prompt, lang) {
  return readJson(bossPath(cwd), null)
    || { name: nameBoss(prompt, cwd, lang), hp: 100, turns: 0, created: Date.now() };
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

module.exports = { nameBoss, hpFromTodos, loadOrCreate, save, clear, bossPath };
