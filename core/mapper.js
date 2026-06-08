/** @typedef {import('./types').SlimeEvent} SlimeEvent */

const path = require('node:path');
const locale = require('./locale');

/** @typedef {{ [key: string]: string[] }} VerbTable */
/** @type {VerbTable} */
const VERBS = {
  read:  ['peers into', 'surveys', 'studies'],
  grep:  ['tracks', 'hunts', 'sniffs out'],
  edit:  ['slashes', 'strikes', 'carves'],
  write: ['forges', 'conjures'],
  bash:  ['detonates', 'unleashes'],
  agent: ['summons', 'dispatches'],
  web:   ['divines', 'scries'],
  skill: ['invokes', 'channels'],
  other: ['wields', 'brandishes'],
};

/** @type {Record<string, string>} */
const ICONS = {
  read: '🔍', grep: '🕵️', edit: '⚔️', write: '🛠️', bash: '💥',
  agent: '🐺', web: '🔮', skill: '✨', other: '🎲',
};

/** @param {string | null | undefined} tool @returns {string} */
function category(tool) {
  const t = (tool || '').toLowerCase();
  const simple = t.split(/[.:]/).pop() || t;
  if (simple === 'read' || simple === 'glob' || simple === 'view_image') return 'read';
  if (simple === 'grep' || simple === 'rg') return 'grep';
  if (simple === 'edit' || simple === 'notebookedit' || simple === 'apply_patch') return 'edit';
  if (simple === 'write') return 'write';
  if (simple === 'bash' || simple === 'exec_command' || simple === 'shell_command') return 'bash';
  if (simple === 'agent' || simple === 'task' || t.startsWith('multi_tool_use.')) return 'agent';
  if (t.startsWith('web') || t.startsWith('browser') || simple === 'open' || simple === 'click') return 'web';
  if (simple === 'skill') return 'skill';
  return 'other';
}

/** @param {string} s @returns {number} */
function hash(s) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

/**
 * @typedef {{
 *   file_path?: string; pattern?: string; query?: string; skill?: string;
 *   description?: string; prompt?: string; command?: string;
 *   [key: string]: unknown;
 * }} ToolInput
 */

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isObj(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

/** @param {ToolInput | unknown} [input] @returns {string} */
function target(input = {}) {
  const { sanitize } = require('./hud');
  if (!isObj(input)) return sanitize(String(input || ''), 40);
  if (input.file_path) return sanitize(path.basename(String(input.file_path)), 40);
  if (input.pattern) return `"${sanitize(String(input.pattern), 40)}"`;
  if (input.query) return `"${sanitize(String(input.query), 40)}"`;
  if (input.skill) return sanitize(String(input.skill), 40);
  if (input.description) return sanitize(String(input.description), 40);
  if (input.prompt) return sanitize(String(input.prompt), 40);
  if (input.command) return sanitize(String(input.command), 40);
  if (input.cmd) return sanitize(String(input.cmd), 40);
  return '';
}

/** @param {string} s @returns {string} */
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

/**
 * @typedef {{
 *   tool_name?: string;
 *   tool_input?: ToolInput;
 *   tool_response?: { is_error?: boolean; [key: string]: unknown };
 *   [key: string]: unknown;
 * }} HookPayload
 */

/**
 * @param {HookPayload | null | undefined} payload
 * @param {number | string} count
 * @param {string} [lang]
 * @returns {SlimeEvent}
 */
function cast(payload, count, lang) {
  payload = payload || {};
  const tool = payload.tool_name || 'Unknown';
  const cat = category(tool);
  const tgt = target(payload.tool_input);
  let text;
  if (lang) {
    const cat_key = `verbs.${cat}`;
    const pool_zh = locale.catalog(lang)[cat_key];
    if (Array.isArray(pool_zh)) {
      const verb = pool_zh[hash(tool + count) % pool_zh.length];
      text = `${ICONS[cat]} ${verb} [${tool}]${tgt ? ` → ${tgt}` : ''}…`;
    }
  }
  if (text === undefined) {
    const pool = VERBS[cat];
    const verb = pool[hash(tool + count) % pool.length];
    text = `${ICONS[cat]} ${cap(verb)} with [${tool}]${tgt ? ` → ${tgt}` : ''}…`;
  }
  return { t: Date.now(), kind: 'cast', tool, text };
}

const TEST_CMD = /\b(test|spec|pytest|jest|vitest|tape|--test)\b/;

/** @param {unknown} s @returns {number} */
function lineCount(s) { return s ? String(s).split('\n').length : 0; }

/** @param {unknown} input @returns {Record<string, unknown>} */
function inputBag(input) {
  if (isObj(input)) return input;
  return typeof input === 'string' ? { content: input } : {};
}

/** @param {Record<string, unknown>} input @returns {number} */
function changedLineCount(input) {
  const body = input.new_string ?? input.content ?? input.patch ?? input.diff;
  if (!body) return 0;
  const text = String(body);
  const patchLines = text.split('\n').filter((line) =>
    (/^[+-]/.test(line) && !line.startsWith('+++') && !line.startsWith('---'))
  ).length;
  return patchLines || lineCount(text);
}

/**
 * @param {HookPayload | null | undefined} payload
 * @param {{ combo?: number; [key: string]: unknown }} [snap]
 * @param {string} [lang]
 * @returns {SlimeEvent}
 */
function resolve(payload, snap = {}, lang) {
  payload = payload || {};
  const tool = payload.tool_name || 'Unknown';
  const cat = category(tool);
  const input = inputBag(payload.tool_input || {});
  const isError = Boolean(payload.tool_response && payload.tool_response.is_error);
  let combo = snap.combo || 0;
  /** @type {SlimeEvent} */
  const ev = { t: Date.now(), kind: 'resolve', tool };

  if (isError) {
    ev.hit = true;
    ev.combo = 0;
    ev.text = lang
      ? locale.fmt(locale.t('resolve.backfire', lang), { tool })
      : `💥 [${tool}] backfires — hit taken! combo broken`;
    return ev;
  }

  if (cat === 'edit' || cat === 'write') {
    ev.dmg = changedLineCount(input);
    ev.combo = combo + 1;
    ev.text = lang
      ? locale.fmt(locale.t('resolve.hit', lang), { dmg: ev.dmg, combo: ev.combo })
      : `⚔️ hit! ${ev.dmg} dmg 🔥combo×${ev.combo}`;
    return ev;
  }

  if (cat === 'bash' && TEST_CMD.test(String(input.command || input.cmd || ''))) {
    ev.kill = true;
    ev.combo = combo;
    ev.text = lang
      ? locale.t('resolve.kill', lang)
      : `💀 tests pass — minion slain!`;
    return ev;
  }

  ev.combo = combo;
  ev.text = '';
  return ev;
}

module.exports = { cast, resolve, category, target, hash, VERBS, ICONS };
