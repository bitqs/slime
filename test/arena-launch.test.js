'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Isolate the marker (and the sibling .spawn lock) to a throwaway dir.
const MARKER = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'slime-launch-')), 'marker.json');
process.env.SLIME_ARENA_MARKER = MARKER;
after(() => fs.rmSync(path.dirname(MARKER), { recursive: true, force: true }));

const arena = require('../core/arena-status');
const launch = require('../core/arena-launch');

function fakeSpawn() {
  const calls = [];
  const fn = (cmd, args, opts) => { calls.push({ cmd, args, opts }); return { unref() {} }; };
  fn.calls = calls;
  return fn;
}

test('live arena → ensureArena is a no-op (no spawn)', () => {
  arena.writeMarker(4117); // our own pid → live
  const spawnFn = fakeSpawn();
  assert.strictEqual(launch.ensureArena({ spawnFn, now: 1000 }), false);
  assert.strictEqual(spawnFn.calls.length, 0);
  arena.clearMarker();
});

test('dead arena → spawns serve.js once, detached', () => {
  arena.clearMarker();
  try { fs.unlinkSync(launch.lockPath()); } catch {}
  const spawnFn = fakeSpawn();
  assert.strictEqual(launch.ensureArena({ spawnFn, now: 10000 }), true);
  assert.strictEqual(spawnFn.calls.length, 1);
  const c = spawnFn.calls[0];
  assert.match(c.args[0], /scripts[/\\]serve\.js$/);
  assert.strictEqual(c.opts.detached, true);
  assert.strictEqual(c.opts.stdio, 'ignore');
});

test('cooldown blocks a second spawn until it elapses', () => {
  arena.clearMarker();
  try { fs.unlinkSync(launch.lockPath()); } catch {}
  const spawnFn = fakeSpawn();
  assert.strictEqual(launch.ensureArena({ spawnFn, now: 20000 }), true);          // first spawns
  assert.strictEqual(launch.ensureArena({ spawnFn, now: 20000 + 1000 }), false);  // within cooldown
  assert.strictEqual(launch.ensureArena({ spawnFn, now: 20000 + launch.COOLDOWN_MS + 1 }), true); // after
  assert.strictEqual(spawnFn.calls.length, 2);
});
