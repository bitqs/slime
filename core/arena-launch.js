'use strict';
// arena-launch — keep the local arena server alive for the statusline link.
//
// The statusline shows a clickable [HUD] link; if the arena server has died the
// link is dead. When `autoArena` is enabled, the statusline calls ensureArena()
// on each render: if no arena is live it spawns a detached serve.js ONCE per
// cooldown window (the statusline fires on every keystroke, so the cooldown is
// essential to avoid spawn storms during the server's ~1s bind). serve.js is
// read-only w.r.t. game state and handles EADDRINUSE quietly, so a redundant
// spawn is harmless. Everything is best-effort and never throws into the HUD.

const fs = require('node:fs');
const path = require('node:path');
const child_process = require('node:child_process');
const arenaStatus = require('./arena-status');

const COOLDOWN_MS = 6000;

/** @returns {string} per-root spawn-attempt lock (next to the liveness marker) */
function lockPath() {
  return arenaStatus.markerPath() + '.spawn';
}

/**
 * Ensure an arena server is running. No-op if one is already live or if a spawn
 * was attempted within the cooldown. Returns true iff it spawned this call.
 * @param {{ spawnFn?: Function, now?: number }} [opts] injectable for tests
 * @returns {boolean}
 */
function ensureArena(opts = {}) {
  try {
    if (arenaStatus.readLive()) return false;            // already up → nothing to do
    const now = opts.now || Date.now();
    const lock = lockPath();
    try {
      const last = Number(fs.readFileSync(lock, 'utf8')) || 0;
      if (now - last < COOLDOWN_MS) return false;        // spawned recently; let it bind
    } catch { /* no lock yet */ }
    fs.writeFileSync(lock, String(now));
    const spawnFn = opts.spawnFn || child_process.spawn;
    const serve = path.join(__dirname, '..', 'scripts', 'serve.js');
    const child = spawnFn(process.execPath, [serve], { detached: true, stdio: 'ignore', env: process.env });
    if (child && typeof child.unref === 'function') child.unref();
    return true;
  } catch {
    return false;
  }
}

module.exports = { ensureArena, COOLDOWN_MS, lockPath };
