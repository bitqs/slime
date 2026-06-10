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

/** @param {Profile} p @returns {boolean} */
function writeProfile(p) {
  ensureDirs();
  return safeWrite(profilePath(), JSON.stringify(p, null, 2));
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

const ACTIVE_MS = 10 * 60 * 1000;

/** Live-session directory listing for the arena picker: newest-first,
 *  capped, tolerant of evicted/corrupt snapshots.
 *  @param {number} [limit]
 *  @returns {Array<{id: string, project: string|null, boss: string|null, turn: number, updated: number, active: boolean}>} */
function listSessions(limit = 12) {
  const dir = path.join(ROOT, 'sessions');
  /** @type {Array<{id: string, project: string|null, boss: string|null, turn: number, updated: number, active: boolean}>} */
  const out = [];
  try {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      const id = f.slice(0, -5);
      try {
        const st = fs.statSync(path.join(dir, f));
        const snap = readSnapshot(id);
        if (!snap) continue;
        out.push({
          id,
          project: snap.cwd ? (String(snap.cwd).split(/[\\/]/).filter(Boolean).pop() || null) : null,
          boss: (snap.boss && snap.boss.name) ? snap.boss.name : null,
          turn: Number(snap.turn) || 0,
          updated: st.mtimeMs,
          active: Date.now() - st.mtimeMs < ACTIVE_MS,
        });
      } catch { /* evicted mid-scan */ }
    }
  } catch { /* sessions dir missing */ }
  out.sort((a, b) => b.updated - a.updated);
  return out.slice(0, limit);
}

/** @returns {StatuslineStdin | null} */
function readStdin() {
  try { return JSON.parse(fs.readFileSync(0, 'utf8')); }
  catch { return null; }
}

module.exports = {
  ROOT, appendEvent, readEvents, readSnapshot, writeSnapshot,
  readProfile, writeProfile, eventsPath, snapshotPath, reportPath, ensureDirs, readStdin,
  newestSessionId, listSessions,
};
