const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = process.env.CCQ_ROOT || path.join(os.homedir(), '.claude', 'ccq');

function ensureDirs() {
  for (const d of ['sessions', 'bosses', 'reports']) {
    fs.mkdirSync(path.join(ROOT, d), { recursive: true });
  }
}

const eventsPath = (id) => path.join(ROOT, 'sessions', `${id}.jsonl`);
const snapshotPath = (id) => path.join(ROOT, 'sessions', `${id}.json`);
const profilePath = () => path.join(ROOT, 'profile.json');
const reportPath = (id) => path.join(ROOT, 'reports', `${id}.txt`);

function appendEvent(id, ev) {
  ensureDirs();
  fs.appendFileSync(eventsPath(id), JSON.stringify(ev) + '\n');
}

function readEvents(id) {
  try {
    return fs.readFileSync(eventsPath(id), 'utf8')
      .split('\n').filter(Boolean).map((l) => JSON.parse(l));
  } catch { return []; }
}

function readSnapshot(id) {
  try { return JSON.parse(fs.readFileSync(snapshotPath(id), 'utf8')); }
  catch { return null; }
}

function writeSnapshot(id, snap) {
  ensureDirs();
  fs.writeFileSync(snapshotPath(id), JSON.stringify(snap));
}

function readProfile() {
  try { return JSON.parse(fs.readFileSync(profilePath(), 'utf8')); }
  catch {
    return { milestones: [], totals: { turns: 0, dmg: 0, kills: 0 }, gear: {} };
  }
}

function writeProfile(p) {
  ensureDirs();
  fs.writeFileSync(profilePath(), JSON.stringify(p, null, 2));
}

function readStdin() {
  try { return JSON.parse(fs.readFileSync(0, 'utf8')); }
  catch { return null; }
}

module.exports = {
  ROOT, appendEvent, readEvents, readSnapshot, writeSnapshot,
  readProfile, writeProfile, eventsPath, snapshotPath, reportPath, ensureDirs, readStdin,
};
