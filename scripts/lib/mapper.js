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
  if (input.prompt) { const s = String(input.prompt); return s.length > 40 ? s.slice(0, 40) + '…' : s; }
  if (input.command) { const s = String(input.command); return s.length > 40 ? s.slice(0, 40) + '…' : s; }
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

const TEST_CMD = /\b(test|spec|pytest|jest|vitest|tape|--test)\b/;

function lineCount(s) { return s ? String(s).split('\n').length : 0; }

function resolve(payload, snap = {}) {
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
    ev.text = `💥 [${tool}] backfires — hit taken! combo broken`;
    return ev;
  }

  if (cat === 'edit' || cat === 'write') {
    ev.dmg = lineCount(input.new_string ?? input.content);
    ev.combo = combo + 1;
    ev.text = `⚔️ hit! ${ev.dmg} dmg 🔥combo×${ev.combo}`;
    return ev;
  }

  if (cat === 'bash' && TEST_CMD.test(input.command || '')) {
    ev.kill = true;
    ev.combo = combo;
    ev.text = `💀 tests pass — minion slain!`;
    return ev;
  }

  ev.combo = combo;
  ev.text = '';
  return ev;
}

module.exports = { cast, resolve, category, target, hash, VERBS, ICONS };
