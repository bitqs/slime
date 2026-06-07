const fs = require('node:fs');
const path = require('node:path');
const state = require('./state');
const { hash } = require('./mapper');

const TYPES = [
  [/fix|bug|error|crash|broken/i, 'Bugbear'],
  [/refactor|rewrite|migrate|clean/i, 'Colossus'],
  [/add|build|implement|create|feature|make/i, 'Hydra'],
  [/test|coverage/i, 'Wraith'],
  [/doc|readme|comment/i, 'Sphinx'],
];

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function nameBoss(prompt, cwd) {
  const type = (TYPES.find(([re]) => re.test(prompt || '')) || [null, 'Golem'])[1];
  const base = cap((cwd || 'unknown').split(/[\\/]/).filter(Boolean).pop() || 'unknown');
  return `The ${base} ${type}`;
}

function hpFromTodos(todos) {
  if (!todos || !todos.length) return 100;
  const done = todos.filter((t) => t.status === 'completed').length;
  return Math.max(0, Math.round(100 * (1 - done / todos.length)));
}

function bossPath(cwd) {
  return path.join(state.ROOT, 'bosses', `${hash(cwd)}.json`);
}

function loadOrCreate(cwd, prompt) {
  try { return JSON.parse(fs.readFileSync(bossPath(cwd), 'utf8')); }
  catch {
    return { name: nameBoss(prompt, cwd), hp: 100, turns: 0, created: Date.now() };
  }
}

function save(cwd, b) {
  state.ensureDirs();
  fs.writeFileSync(bossPath(cwd), JSON.stringify(b));
}

function clear(cwd) {
  try { fs.unlinkSync(bossPath(cwd)); } catch {}
}

module.exports = { nameBoss, hpFromTodos, loadOrCreate, save, clear, bossPath };
