/** @typedef {import('./types').Snapshot} Snapshot */
/** @typedef {import('./types').Profile} Profile */
/** @typedef {import('./types').SlimeEvent} SlimeEvent */
/** @typedef {import('./types').StatuslineStdin} StatuslineStdin */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { safeWrite, safeAppend, readJson, safeMkdir } = require('./safe-io');

// Resolution order mirrors caveman's contract: explicit override, then
// Claude Code's config-dir override, then the default.
const ROOT = process.env.SLIME_ROOT
  || (process.env.CLAUDE_CONFIG_DIR && path.join(process.env.CLAUDE_CONFIG_DIR, 'slime'))
  || (process.env.SLIME_HARNESS === 'codex' && path.join(process.env.CODEX_CONFIG_DIR || process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'slime'))
  || path.join(os.homedir(), '.claude', 'slime');

function ensureDirs() {
  for (const d of ['sessions', 'bosses', 'reports']) {
    safeMkdir(path.join(ROOT, d));
  }
}

/** @param {string} id @returns {string} */
const eventsPath = (id) => path.join(ROOT, 'sessions', `${id}.jsonl`);
/** @param {string} id @returns {string} */
const snapshotPath = (id) => path.join(ROOT, 'sessions', `${id}.json`);
const profilePath = () => path.join(ROOT, 'profile.json');
/** @param {string} id @returns {string} */
const reportPath = (id) => path.join(ROOT, 'reports', `${id}.txt`);

/** @param {string} id @param {SlimeEvent} ev @returns {void} */
function appendEvent(id, ev) {
  ensureDirs();
  safeAppend(eventsPath(id), JSON.stringify(ev) + '\n');
}

/** @param {string} id @returns {SlimeEvent[]} */
function readEvents(id) {
  try {
    const out = [];
    for (const l of fs.readFileSync(eventsPath(id), 'utf8').split('\n')) {
      if (!l) continue;
      try { out.push(JSON.parse(l)); } catch { /* skip corrupt line */ }
    }
    return out;
  } catch { return []; }
}

/** @param {string} id @returns {Snapshot | null} */
function readSnapshot(id) {
  return readJson(snapshotPath(id), null);
}

/** @param {string} id @param {Snapshot} snap @returns {void} */
function writeSnapshot(id, snap) {
  ensureDirs();
  safeWrite(snapshotPath(id), JSON.stringify(snap));
}

/** @returns {Profile} */
function readProfile() {
  return readJson(profilePath(), null)
    || { milestones: [], totals: { turns: 0, dmg: 0, kills: 0 }, gear: {} };
}

/** @param {Profile} p @returns {void} */
function writeProfile(p) {
  ensureDirs();
  safeWrite(profilePath(), JSON.stringify(p, null, 2));
}

function newestSessionId() {
  const dir = path.join(ROOT, 'sessions');
  let best = null, bestMtime = 0;
  try {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      try {
        const st = fs.statSync(path.join(dir, f));
        if (st.mtimeMs > bestMtime) { bestMtime = st.mtimeMs; best = f.slice(0, -5); }
      } catch { /* evicted */ }
    }
  } catch { /* missing */ }
  return best;
}

/** @returns {StatuslineStdin | null} */
function readStdin() {
  try { return JSON.parse(fs.readFileSync(0, 'utf8')); }
  catch { return null; }
}

module.exports = {
  ROOT, appendEvent, readEvents, readSnapshot, writeSnapshot,
  readProfile, writeProfile, eventsPath, snapshotPath, reportPath, ensureDirs, readStdin,
  newestSessionId,
};
