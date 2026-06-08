'use strict';
// arena-status — liveness + port marker shared by serve.js (writer) and the
// statusline HUD (reader). The marker lives in the OS temp dir, NOT under
// SLIME_ROOT: it is process liveness, not game state, so serve.js stays
// READ-ONLY w.r.t. ROOT and the observer principle holds. Every function
// silent-fails — a broken marker must never break the statusline or the server.

const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { safeWrite, readJson } = require('./safe-io');

/** @typedef {{ port: number, pid: number }} ArenaMarker */

// Fixed temp path so writer (serve.js) and reader (statusline) agree without
// passing state. SLIME_ARENA_MARKER overrides it — tests use this to isolate.
/** @returns {string} */
function markerPath() {
  return process.env.SLIME_ARENA_MARKER || path.join(os.tmpdir(), 'slime-arena.json');
}

/** @param {number} pid @returns {boolean} */
function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // EPERM = process exists but owned by another user → still alive.
    return /** @type {NodeJS.ErrnoException} */ (e).code === 'EPERM';
  }
}

/** Record this process as the live arena on `port`. @param {number} port @returns {boolean} */
function writeMarker(port) {
  return safeWrite(markerPath(), JSON.stringify({ port, pid: process.pid }));
}

/**
 * Remove the marker — but only if THIS process owns it. A second serve.js that
 * hits EADDRINUSE and exits must not wipe the live server's marker (that killed
 * the statusline 【UI】 link on every re-launch). Best-effort; never throws.
 * @returns {void}
 */
function clearMarker() {
  try {
    const m = readJson(markerPath(), /** @type {ArenaMarker | null} */ (null));
    if (m && m.pid !== process.pid) return; // not ours — leave it
    fs.unlinkSync(markerPath());
  } catch { /* already gone */ }
}

/**
 * Live arena info if a marker exists AND its process is still running.
 * Stale markers (dead pid) read as null, so the HUD never shows a dead link.
 * @returns {{ port: number } | null}
 */
function readLive() {
  const m = readJson(markerPath(), /** @type {ArenaMarker | null} */ (null));
  if (!m || typeof m.port !== 'number' || !pidAlive(m.pid)) return null;
  return { port: m.port };
}

module.exports = { markerPath, writeMarker, clearMarker, readLive };
