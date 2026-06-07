const path = require('node:path');
const locale = require('./locale');

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

const ICONS = {
  read: '🔍', grep: '🕵️', edit: '⚔️', write: '🛠️', bash: '💥',
  agent: '🐺', web: '🔮', skill: '✨', other: '🎲',
};

function category(tool) {
  const t = (tool || '').toLowerCase();
  if (t === 'read' || t === 'glob') return 'read';
  if (t === 'grep') return 'grep';
  if (t === 'edit' || t === 'notebookedit') return 'edit';
  if (t === 'write') return 'write';
  if (t === 'bash') return 'bash';
  if (t === 'agent' || t === 'task') return 'agent';
  if (t.startsWith('web')) return 'web';
  if (t === 'skill') return 'skill';
  return 'other';
}

function hash(s) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

function target(input = {}) {
  const { sanitize } = require('./hud');
  if (input.file_path) return sanitize(path.basename(input.file_path), 40);
  if (input.pattern) return `"${sanitize(input.pattern, 40)}"`;
  if (input.query) return `"${sanitize(input.query, 40)}"`;
  if (input.skill) return sanitize(input.skill, 40);
  if (input.description) return sanitize(input.description, 40);
  if (input.prompt) return sanitize(input.prompt, 40);
  if (input.command) return sanitize(input.command, 40);
  return '';
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

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

function lineCount(s) { return s ? String(s).split('\n').length : 0; }

function resolve(payload, snap = {}, lang) {
  payload = payload || {};
  const tool = payload.tool_name || 'Unknown';
  const cat = category(tool);
  const input = payload.tool_input || {};
  const isError = Boolean(payload.tool_response && payload.tool_response.is_error);
  let combo = snap.combo || 0;
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
    ev.dmg = lineCount(input.new_string ?? input.content);
    ev.combo = combo + 1;
    ev.text = lang
      ? locale.fmt(locale.t('resolve.hit', lang), { dmg: ev.dmg, combo: ev.combo })
      : `⚔️ hit! ${ev.dmg} dmg 🔥combo×${ev.combo}`;
    return ev;
  }

  if (cat === 'bash' && TEST_CMD.test(input.command || '')) {
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
