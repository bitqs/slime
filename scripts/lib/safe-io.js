'use strict';
// safe-io — the single gateway for Slime state IO.
// Threat model: predictable user-owned paths under ~/.claude/slime; a local
// attacker (or buggy tool) may swap a path for a symlink so our write clobbers
// an arbitrary user-writable file. Every function silent-fails: Slime is a
// game layer — if the game breaks, work continues untouched.
const fs = require('node:fs');
const path = require('node:path');

/** @param {string} p @returns {boolean} */
function isSymlink(p) {
  try { return fs.lstatSync(p).isSymbolicLink(); } catch { return false; }
}

/** @param {string} p @returns {boolean} */
function refuse(p) {
  return isSymlink(p) || isSymlink(path.dirname(p));
}

// Atomic replace: temp + rename. Mode 0600. Returns false on any refusal/error.
/** @param {string} p @param {string} content @returns {boolean} */
function safeWrite(p, content) {
  try {
    if (refuse(p)) return false;
    const tmp = `${p}.tmp.${process.pid}`;
    fs.writeFileSync(tmp, content, { mode: 0o600 });
    try { fs.renameSync(tmp, p); }
    catch (e) { try { fs.unlinkSync(tmp); } catch {} throw e; }
    return true;
  } catch { return false; }
}

// Append for JSONL streams (rename-replace impossible). O_NOFOLLOW where the
// platform supports it; symlink pre-check covers the rest.
/** @param {string} p @param {string} line @returns {boolean} */
function safeAppend(p, line) {
  try {
    if (refuse(p)) return false;
    const flags = fs.constants.O_APPEND | fs.constants.O_CREAT | fs.constants.O_WRONLY
      | (fs.constants.O_NOFOLLOW || 0);
    const fd = fs.openSync(p, flags, 0o600);
    try { fs.writeSync(fd, line); } finally { fs.closeSync(fd); }
    return true;
  } catch { return false; }
}

// Tolerant read: corrupt, missing, or non-JSON file → fallback. Never throws.
/** @template T @param {string} p @param {T} fallback @returns {T} */
function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}

/** @param {string} p @returns {boolean} */
function safeMkdir(p) {
  try {
    // Parent-symlink NOT refused here: symlinking the whole slime root to another
    // disk is legitimate; file-level clobber is prevented by safeWrite/safeAppend.
    if (isSymlink(p)) return false;
    fs.mkdirSync(p, { recursive: true });
    return true;
  } catch { return false; }
}

module.exports = { safeWrite, safeAppend, readJson, safeMkdir };
