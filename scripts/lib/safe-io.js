'use strict';
// safe-io — the single gateway for Questline state IO.
// Threat model: predictable user-owned paths under ~/.claude/ccq; a local
// attacker (or buggy tool) may swap a path for a symlink so our write clobbers
// an arbitrary user-writable file. Every function silent-fails: Questline is a
// game layer — if the game breaks, work continues untouched.
const fs = require('node:fs');
const path = require('node:path');

function isSymlink(p) {
  try { return fs.lstatSync(p).isSymbolicLink(); } catch { return false; }
}

function refuse(p) {
  return isSymlink(p) || isSymlink(path.dirname(p));
}

// Atomic replace: temp + rename. Mode 0600. Returns false on any refusal/error.
function safeWrite(p, content) {
  try {
    if (refuse(p)) return false;
    const tmp = `${p}.tmp.${process.pid}`;
    fs.writeFileSync(tmp, content, { mode: 0o600 });
    fs.renameSync(tmp, p);
    return true;
  } catch { return false; }
}

// Append for JSONL streams (rename-replace impossible). O_NOFOLLOW where the
// platform supports it; symlink pre-check covers the rest.
function safeAppend(p, line) {
  try {
    if (refuse(p)) return false;
    const flags = fs.constants.O_APPEND | fs.constants.O_CREAT | fs.constants.O_WRONLY
      | (fs.constants.O_NOFOLLOW || 0);
    const fd = fs.openSync(p, flags, 0o600);
    try { fs.writeFileSync(fd, line); } finally { fs.closeSync(fd); }
    return true;
  } catch { return false; }
}

// Tolerant read: corrupt, missing, or non-JSON file → fallback. Never throws.
function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}

function safeMkdir(p) {
  try {
    if (isSymlink(p)) return false;
    fs.mkdirSync(p, { recursive: true });
    return true;
  } catch { return false; }
}

module.exports = { safeWrite, safeAppend, readJson, safeMkdir };
