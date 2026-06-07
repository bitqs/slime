const path = require('node:path');

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
  if (input.file_path) return path.basename(input.file_path);
  if (input.pattern) return `"${input.pattern}"`;
  if (input.query) return `"${input.query}"`;
  if (input.skill) return input.skill;
  if (input.description) return input.description;
  if (input.prompt) return String(input.prompt).slice(0, 40) + '…';
  if (input.command) return String(input.command).slice(0, 40) + '…';
  return '';
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function cast(payload, count) {
  payload = payload || {};
  const tool = payload.tool_name || 'Unknown';
  const cat = category(tool);
  const pool = VERBS[cat];
  const verb = pool[hash(tool + count) % pool.length];
  const tgt = target(payload.tool_input);
  const text = `${ICONS[cat]} ${cap(verb)} with [${tool}]${tgt ? ` → ${tgt}` : ''}…`;
  return { t: Date.now(), kind: 'cast', tool, text };
}

module.exports = { cast, category, target, hash, VERBS, ICONS };
