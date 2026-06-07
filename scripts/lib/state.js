const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { safeWrite, safeAppend, readJson, safeMkdir } = require('./safe-io');

// Resolution order mirrors caveman's contract: explicit override, then
// Claude Code's config-dir override, then the default.
const ROOT = process.env.CCQ_ROOT
  || (process.env.CLAUDE_CONFIG_DIR && path.join(process.env.CLAUDE_CONFIG_DIR, 'ccq'))
  || path.join(os.homedir(), '.claude', 'ccq');

function ensureDirs() {
  for (const d of ['sessions', 'bosses', 'reports']) {
    safeMkdir(path.join(ROOT, d));
  }
}

const eventsPath = (id) => path.join(ROOT, 'sessions', `${id}.jsonl`);
const snapshotPath = (id) => path.join(ROOT, 'sessions', `${id}.json`);
const profilePath = () => path.join(ROOT, 'profile.json');
const reportPath = (id) => path.join(ROOT, 'reports', `${id}.txt`);

function appendEvent(id, ev) {
  ensureDirs();
  safeAppend(eventsPath(id), JSON.stringify(ev) + '\n');
}

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

function readSnapshot(id) {
  return readJson(snapshotPath(id), null);
}

function writeSnapshot(id, snap) {
  ensureDirs();
  safeWrite(snapshotPath(id), JSON.stringify(snap));
}

function readProfile() {
  return readJson(profilePath(), null)
    || { milestones: [], totals: { turns: 0, dmg: 0, kills: 0 }, gear: {} };
}

function writeProfile(p) {
  ensureDirs();
  safeWrite(profilePath(), JSON.stringify(p, null, 2));
}

function readStdin() {
  try { return JSON.parse(fs.readFileSync(0, 'utf8')); }
  catch { return null; }
}

module.exports = {
  ROOT, appendEvent, readEvents, readSnapshot, writeSnapshot,
  readProfile, writeProfile, eventsPath, snapshotPath, reportPath, ensureDirs, readStdin,
};
